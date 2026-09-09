export type ShareCard = { title?: string; text: string; url: string; imageUrl?: string; fileName?: string };

/** Native sharing with an image when supported, then text/URL, then clipboard. */
export async function shareCard(card: ShareCard): Promise<"shared" | "copied" | "cancelled"> {
  try {
    if (navigator.share) {
      if (card.imageUrl && typeof File !== "undefined" && navigator.canShare) {
        try {
          const response = await fetch(card.imageUrl);
          if (response.ok) {
            const file = new File([await response.blob()], card.fileName ?? "keep-him-walking.png", { type: "image/png" });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ title: card.title, text: card.text, url: card.url, files: [file] });
              return "shared";
            }
          }
        } catch {
          // The text share below remains available when the image cannot be prepared.
        }
      }
      await navigator.share({ title: card.title, text: card.text, url: card.url });
      return "shared";
    }
    await navigator.clipboard.writeText(`${card.text} ${card.url}`.trim());
    return "copied";
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "cancelled";
  }
}
