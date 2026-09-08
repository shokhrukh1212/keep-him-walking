import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StageCalibration } from "./StageCalibration";
import { tbilisiCountryPackV1 } from "@/content/countries/tbilisi.v1";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("edits locally, keeps zone drafts separate, and copies the complete stage block", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {configurable: true, value: {writeText}});
  const fetch = vi.spyOn(globalThis, "fetch");
  render(<StageCalibration packId={tbilisiCountryPackV1.assetVersion} zones={tbilisiCountryPackV1.route.zones} />);
  fireEvent.keyDown(screen.getByRole("button", {name: "Drag ground line"}), {key: "ArrowDown"});
  fireEvent.keyDown(screen.getByRole("button", {name: "Drag horizon line"}), {key: "ArrowUp"});
  fireEvent.keyDown(screen.getByRole("button", {name: "Drag person height"}), {key: "ArrowUp"});
  const changed = JSON.parse(screen.getByTestId("stage-json").textContent!);
  expect(changed.stage.groundLineY).toBe(0.845);
  expect(changed.stage.horizonY).toBe(0.695);
  expect(changed.stage.personHeightFrac).toBe(0.205);
  fireEvent.change(screen.getByRole("combobox", {name: "Zone"}), {target: {value: "balcony-lanes"}});
  expect(JSON.parse(screen.getByTestId("stage-json").textContent!).stage).toEqual(tbilisiCountryPackV1.route.zones[1].stage);
  fireEvent.change(screen.getByRole("combobox", {name: "Zone"}), {target: {value: "rustaveli-arrival"}});
  fireEvent.click(screen.getByRole("button", {name: "Copy stage JSON"}));
  expect(await screen.findByText("Copied.")).toBeInTheDocument();
  expect(JSON.parse(writeText.mock.calls[0][0])).toEqual(changed);
  expect(fetch).not.toHaveBeenCalled();
  expect(tbilisiCountryPackV1.route.zones[0].stage.groundLineY).toBe(0.84);
});

it("converts pointer drags into full-image fractions and ends the drag on release", () => {
  // jsdom lacks PointerEvent and pointer capture; preserve real mouse coordinates.
  vi.stubGlobal("PointerEvent", MouseEvent);
  render(<StageCalibration packId={tbilisiCountryPackV1.assetVersion} zones={tbilisiCountryPackV1.route.zones} />);
  const ground = screen.getByRole("button", {name: "Drag ground line"});
  vi.spyOn(ground.parentElement!, "getBoundingClientRect").mockReturnValue({
    top: 100, height: 1000, left: 0, width: 1500, right: 1500, bottom: 1100,
    x: 0, y: 100, toJSON: () => ({}),
  });
  for (const [name, clientY, field, expected] of [
    ["Drag ground line", 1000, "groundLineY", 0.9],
    ["Drag horizon line", 650, "horizonY", 0.55],
    ["Drag person height", 750, "personHeightFrac", 0.25],
  ] as const) {
    const handle = screen.getByRole("button", {name});
    handle.setPointerCapture = vi.fn();
    fireEvent.pointerDown(handle);
    fireEvent.pointerMove(handle, {clientY});
    fireEvent.pointerUp(handle);
    fireEvent.pointerMove(handle, {clientY: 0});
    expect(JSON.parse(screen.getByTestId("stage-json").textContent!).stage[field]).toBe(expected);
  }
});

it("shows the rendered scale diagnostics and regeneration warning after the master loads", () => {
  render(<StageCalibration packId="test-pack" zones={tbilisiCountryPackV1.route.zones} />);
  const image = screen.getByAltText(`${tbilisiCountryPackV1.route.zones[0].label} calibration panorama`);
  Object.defineProperties(image, {
    naturalWidth: {configurable: true, value: 100},
    naturalHeight: {configurable: true, value: 100},
  });
  fireEvent.load(image);

  expect(screen.getByLabelText("Scale readouts")).toHaveTextContent("personHeightFrac0.200");
  expect(screen.getByLabelText("Scale readouts")).toHaveTextContent("Resulting character216.0 px");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "pack test-pack/rustaveli-arrival: master composed too far away (needs imageScale 10.800); regenerate at eye level",
  );
  expect(screen.getByLabelText("216.0 pixel target character")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", {name: "Rendered viewport"}), {target: {value: "mobile"}});
  expect(screen.getByLabelText("Scale readouts")).toHaveTextContent("Resulting character168.8 px");
});
