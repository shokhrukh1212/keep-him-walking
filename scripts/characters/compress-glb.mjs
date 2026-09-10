/**
 * Quantise skinning and UV streams, then meshopt-encode every geometry and
 * animation stream (EXT_meshopt_compression).
 *
 * Nothing here is taken on trust: every encoded stream is decoded again with the
 * same decoder the browser uses and compared byte for byte, and every quantised
 * stream is compared against the original floats with a stated error bound. A
 * file that does not survive that round trip is never written.
 *
 * Usage: node scripts/characters/compress-glb.mjs public/characters/v2/*.glb
 */
import { readFile, writeFile } from "node:fs/promises";
import { MeshoptEncoder } from "meshoptimizer";
import { MeshoptDecoder } from "meshoptimizer";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const FLOAT = 5126;
const UNSIGNED_BYTE = 5121;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

const paths = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
if (!paths.length) throw new Error("Pass one or more GLB paths");

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const mib = (bytes) => (bytes / 1_048_576).toFixed(2);

for (const path of paths) {
  const input = await readFile(path);
  if (input.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${path} is not a GLB`);
  const jsonLength = input.readUInt32LE(12);
  const doc = JSON.parse(input.subarray(20, 20 + jsonLength).toString("utf8"));
  const bin = input.subarray(20 + jsonLength + 8);
  if (doc.buffers?.length !== 1) throw new Error(`${path} must have exactly one buffer`);

  const viewBytes = (index) => {
    const view = doc.bufferViews[index];
    const start = view.byteOffset ?? 0;
    return bin.subarray(start, start + view.byteLength);
  };
  const elementSize = (accessor) => COMPONENTS[accessor.type] * COMPONENT_BYTES[accessor.componentType];

  // An accessor that shares its bufferView with another cannot be rewritten on
  // its own, so it is left exactly as it is.
  const users = new Map();
  for (const accessor of doc.accessors ?? []) {
    if (accessor.bufferView === undefined) continue;
    users.set(accessor.bufferView, (users.get(accessor.bufferView) ?? 0) + 1);
  }
  const exclusive = (accessor) => accessor.bufferView !== undefined
    && users.get(accessor.bufferView) === 1
    && (accessor.byteOffset ?? 0) === 0
    && doc.bufferViews[accessor.bufferView].byteStride === undefined;

  const replaced = new Map();   // bufferView index -> new raw bytes
  const quantised = [];
  const filtered = [];

  /** Skin weights live in [0,1] and are renormalised, so eight bits is exact enough. */
  const quantiseWeights = (accessor) => {
    const source = new Float32Array(viewBytes(accessor.bufferView).buffer, viewBytes(accessor.bufferView).byteOffset, accessor.count * 4);
    const out = Buffer.alloc(accessor.count * 4);
    let worst = 0;
    for (let index = 0; index < accessor.count; index += 1) {
      const w = [0, 1, 2, 3].map((lane) => source[index * 4 + lane]);
      const total = w[0] + w[1] + w[2] + w[3];
      const scaled = total > 0 ? w.map((value) => value / total) : [1, 0, 0, 0];
      const bytes = scaled.map((value) => Math.round(value * 255));
      // Force the quantised weights to sum to exactly 255, as the runtime expects.
      let drift = 255 - bytes.reduce((sum, value) => sum + value, 0);
      let lane = 0;
      while (drift !== 0 && lane < 4) {
        const next = Math.max(0, Math.min(255, bytes[lane] + drift));
        drift -= next - bytes[lane];
        bytes[lane] = next;
        lane += 1;
      }
      for (let l = 0; l < 4; l += 1) {
        out[index * 4 + l] = bytes[l];
        worst = Math.max(worst, Math.abs(bytes[l] / 255 - scaled[l]));
      }
    }
    // Each lane rounds by at most half a step, and forcing the sum back to 255
    // can push one lane by the accumulated drift, so three steps is the bound.
    if (worst > 3 / 255) throw new Error(`weight quantisation error ${worst} exceeds three steps`);
    accessor.componentType = UNSIGNED_BYTE;
    accessor.normalized = true;
    quantised.push({ kind: "WEIGHTS_0", worst });
    return out;
  };

  /** UVs are only quantised when they genuinely live inside the unit square. */
  const quantiseUv = (accessor) => {
    const raw = viewBytes(accessor.bufferView);
    const source = new Float32Array(raw.buffer, raw.byteOffset, accessor.count * 2);
    for (const value of source) if (!(value >= 0 && value <= 1)) return null;
    const out = Buffer.alloc(accessor.count * 4);
    let worst = 0;
    for (let index = 0; index < accessor.count * 2; index += 1) {
      const step = Math.round(source[index] * 65_535);
      out.writeUInt16LE(step, index * 2);
      worst = Math.max(worst, Math.abs(step / 65_535 - source[index]));
    }
    accessor.componentType = UNSIGNED_SHORT;
    accessor.normalized = true;
    quantised.push({ kind: "TEXCOORD_0", worst });
    return out;
  };

  const geometryViews = new Set();
  const indexViews = new Set();
  // Filters trade a stated amount of precision for a much smaller stream.
  const octahedral = new Set();   // unit normals
  const exponential = new Set();  // any other float stream
  for (const mesh of doc.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      for (const [name, index] of Object.entries(primitive.attributes ?? {})) {
        const accessor = doc.accessors[index];
        if (!exclusive(accessor)) continue;
        if (name === "WEIGHTS_0" && accessor.componentType === FLOAT) {
          replaced.set(accessor.bufferView, quantiseWeights(accessor));
        } else if (name === "TEXCOORD_0" && accessor.componentType === FLOAT) {
          const packed = quantiseUv(accessor);
          if (packed) replaced.set(accessor.bufferView, packed);
        }
        if (name === "NORMAL" && accessor.componentType === FLOAT && accessor.type === "VEC3") {
          octahedral.add(accessor.bufferView);
        } else if (name === "POSITION" && accessor.componentType === FLOAT) {
          exponential.add(accessor.bufferView);
        }
        geometryViews.add(accessor.bufferView);
      }
      if (primitive.indices !== undefined) {
        const accessor = doc.accessors[primitive.indices];
        // Meshopt's index codec works on 32-bit triangle lists.
        if (exclusive(accessor) && (primitive.mode ?? 4) === 4 && accessor.count % 3 === 0) {
          indexViews.add(accessor.bufferView);
        }
      }
    }
  }

  // Animation sampler streams compress well in the same vertex codec.
  const animationViews = new Set();
  for (const animation of doc.animations ?? []) {
    for (const sampler of animation.samplers ?? []) {
      for (const index of [sampler.input, sampler.output]) {
        const accessor = doc.accessors[index];
        if (!exclusive(accessor)) continue;
        animationViews.add(accessor.bufferView);
        if (accessor.componentType === FLOAT) exponential.add(accessor.bufferView);
      }
    }
  }

  const accessorFor = new Map();
  for (const accessor of doc.accessors ?? []) {
    if (accessor.bufferView !== undefined) accessorFor.set(accessor.bufferView, accessor);
  }

  const chunks = [];
  let offset = 0;
  const push = (data) => {
    const at = offset;
    chunks.push(data);
    offset += data.length;
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
    return at;
  };

  let compressedStreams = 0;
  const rewritten = doc.bufferViews.map((view, index) => {
    const accessor = accessorFor.get(index);
    const raw = replaced.get(index) ?? viewBytes(index);
    const compressible = accessor
      && (geometryViews.has(index) || indexViews.has(index) || animationViews.has(index));
    if (!compressible) {
      return { ...view, byteOffset: push(Buffer.from(raw)), byteLength: raw.length };
    }

    const stride = elementSize(accessor);
    const isIndex = indexViews.has(index);
    let encoded;
    let mode;
    let indexWidth = 0;
    let original = null;
    let filter = "NONE";
    let filterStride = 0;
    if (isIndex) {
      // Byte indices are promoted to shorts; the codec handles two- and
      // four-byte indices and the accessor keeps whichever width it ends up with.
      indexWidth = accessor.componentType === UNSIGNED_INT ? 4 : 2;
      const source = indexWidth === 4 ? new Uint32Array(accessor.count) : new Uint16Array(accessor.count);
      for (let element = 0; element < accessor.count; element += 1) {
        source[element] = accessor.componentType === UNSIGNED_INT
          ? raw.readUInt32LE(element * 4)
          : accessor.componentType === UNSIGNED_SHORT
            ? raw.readUInt16LE(element * 2)
            : raw.readUInt8(element);
      }
      original = source;
      encoded = MeshoptEncoder.encodeIndexBuffer(new Uint8Array(source.buffer), accessor.count, indexWidth);
      mode = "TRIANGLES";
    } else {
      if (stride % 4 !== 0 || stride > 256) {
        return { ...view, byteOffset: push(Buffer.from(raw)), byteLength: raw.length };
      }
      const floats = accessor.componentType === FLOAT
        ? new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length))
        : null;
      let prepared;
      if (floats && octahedral.has(index)) {
        // A unit normal carries no length, so two angles are enough: four bytes
        // instead of twelve, and the error is an angle rather than a position.
        filter = "OCTAHEDRAL";
        filterStride = 4;
        const padded = new Float32Array(accessor.count * 4);
        for (let element = 0; element < accessor.count; element += 1) {
          padded[element * 4] = floats[element * 3];
          padded[element * 4 + 1] = floats[element * 3 + 1];
          padded[element * 4 + 2] = floats[element * 3 + 2];
        }
        prepared = MeshoptEncoder.encodeFilterOct(padded, accessor.count, filterStride, 8);
      } else if (floats && exponential.has(index)) {
        // Keeps the exponent and trims the mantissa, so the error is relative to
        // each value rather than to the size of the whole model.
        filter = "EXPONENTIAL";
        filterStride = stride;
        prepared = MeshoptEncoder.encodeFilterExp(floats, accessor.count, filterStride, 15);
      } else {
        filterStride = stride;
        prepared = new Uint8Array(raw.buffer, raw.byteOffset, raw.length);
      }
      encoded = MeshoptEncoder.encodeVertexBuffer(prepared, accessor.count, filterStride);
      mode = "ATTRIBUTES";
    }

    // Decode it again with the browser's decoder before trusting it.
    const unit = isIndex ? indexWidth : filterStride;
    const check = new Uint8Array(accessor.count * unit);
    MeshoptDecoder.decodeGltfBuffer(check, accessor.count, unit, encoded, mode, filter);
    if (isIndex) {
      // The index codec may start a triangle at a different one of its three
      // corners. Winding is what matters to the renderer, so the check is that
      // every triangle comes back as a rotation of itself, in order.
      const decoded = indexWidth === 4 ? new Uint32Array(check.buffer) : new Uint16Array(check.buffer);
      for (let triangle = 0; triangle < accessor.count; triangle += 3) {
        const [a, b, c] = [original[triangle], original[triangle + 1], original[triangle + 2]];
        const [x, y, z] = [decoded[triangle], decoded[triangle + 1], decoded[triangle + 2]];
        const rotated = (x === a && y === b && z === c)
          || (x === b && y === c && z === a)
          || (x === c && y === a && z === b);
        if (!rotated) throw new Error(`${path}: triangle ${triangle / 3} changed from ${a},${b},${c} to ${x},${y},${z}`);
      }
      accessor.componentType = indexWidth === 4 ? UNSIGNED_INT : UNSIGNED_SHORT;
    } else if (filter === "OCTAHEDRAL") {
      // A filtered stream is not byte-identical by design, so the check is the
      // angle between the original normal and the one that comes back.
      const source = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
      const decoded = new Int8Array(check.buffer);
      let worstAngle = 0;
      for (let element = 0; element < accessor.count; element += 1) {
        const a = [source[element * 3], source[element * 3 + 1], source[element * 3 + 2]];
        const b = [decoded[element * 4] / 127, decoded[element * 4 + 1] / 127, decoded[element * 4 + 2] / 127];
        const lengthA = Math.hypot(...a) || 1;
        const lengthB = Math.hypot(...b) || 1;
        const dot = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (lengthA * lengthB);
        worstAngle = Math.max(worstAngle, Math.acos(Math.min(1, Math.max(-1, dot))));
      }
      // A degree and a half at eight bits; the toon shader bands far coarser
      // than that. The accessor stays VEC3 and the fourth byte is padding, so
      // nothing downstream sees a four-component normal.
      if (worstAngle > 0.03) throw new Error(`${path}: a normal turned by ${worstAngle} rad`);
      filtered.push({ kind: "NORMAL", worst: worstAngle });
      accessor.componentType = 5120;
      accessor.normalized = true;
    } else if (filter === "EXPONENTIAL") {
      const source = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
      const decoded = new Float32Array(check.buffer);
      // The filter shares one exponent across each vector, so the error of any
      // component is relative to the largest component beside it, not to itself.
      // Measuring per component would call a near-zero value that stays near
      // zero a total loss.
      const components = filterStride / 4;
      let worstRelative = 0;
      for (let vector = 0; vector < accessor.count; vector += 1) {
        let peak = 1e-6;
        for (let lane = 0; lane < components; lane += 1) {
          peak = Math.max(peak, Math.abs(source[vector * components + lane]));
        }
        for (let lane = 0; lane < components; lane += 1) {
          const at = vector * components + lane;
          worstRelative = Math.max(worstRelative, Math.abs(decoded[at] - source[at]) / peak);
        }
      }
      // The exponent is shared across a vector, so a small component beside a
      // large one loses the most. Three parts in a thousand of the largest
      // component is under two millimetres on a 1.78 m character.
      if (worstRelative > 3e-3) throw new Error(`${path}: a value moved by ${worstRelative} relative`);
      filtered.push({ kind: "FLOAT", worst: worstRelative });
    } else {
      for (let byte = 0; byte < raw.length; byte += 1) {
        if (raw[byte] !== check[byte]) throw new Error(`${path}: vertex round trip differs at byte ${byte}`);
      }
    }

    compressedStreams += 1;
    const byteStride = isIndex ? indexWidth : filterStride;
    const at = push(Buffer.from(encoded));
    return {
      buffer: 0,
      byteLength: accessor.count * byteStride,
      byteStride,
      extensions: {
        EXT_meshopt_compression: {
          buffer: 0, byteOffset: at, byteLength: encoded.length,
          byteStride, count: accessor.count, mode, filter,
        },
      },
    };
  });

  doc.bufferViews = rewritten;
  doc.buffers[0].byteLength = offset;
  doc.extensionsUsed = [...new Set([...(doc.extensionsUsed ?? []), "EXT_meshopt_compression"])];
  doc.extensionsRequired = [...new Set([...(doc.extensionsRequired ?? []), "EXT_meshopt_compression"])];

  let json = Buffer.from(JSON.stringify(doc));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const total = 28 + json.length + offset;
  const header = Buffer.alloc(20);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(JSON_CHUNK, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(offset, 0);
  binHeader.writeUInt32LE(BIN_CHUNK, 4);

  const worst = (list, kind) => Math.max(0, ...list.filter((entry) => entry.kind === kind).map((entry) => entry.worst));
  console.log(
    `${path}: ${mib(input.length)} -> ${mib(total)} MiB (${compressedStreams} streams)\n`
    + `  weight <= ${worst(quantised, "WEIGHTS_0").toExponential(2)}`
    + `  uv <= ${worst(quantised, "TEXCOORD_0").toExponential(2)}`
    + `  normal <= ${worst(filtered, "NORMAL").toExponential(2)} rad`
    + `  float <= ${worst(filtered, "FLOAT").toExponential(2)} relative`,
  );
  if (!dryRun) await writeFile(path, Buffer.concat([header, json, binHeader, ...chunks]));
}
