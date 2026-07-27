// Filenames come from the client (req.file.originalname) and are untrusted:
// they can contain control characters, path-traversal sequences, or unusual
// Unicode that could cause display issues or (in other contexts) path
// injection. This project only ever stores the name as a string field and
// displays it as text, so the risk here is mainly rendering/consistency
// rather than filesystem traversal — but sanitizing at the boundary is cheap
// and avoids relying on every downstream consumer doing it right.
export function sanitizeFilename(name) {
  if (!name || typeof name !== "string") return "untitled.pdf";

  return (
    name
      .normalize("NFC") // canonical Unicode form, so visually-identical names compare equal
      .replace(/[\u0000-\u001f\u007f]/g, "") // strip control characters
      .replace(/[/\\]/g, "-") // no path separators
      .trim()
      .slice(0, 200) || "untitled.pdf" // guard against an all-stripped/empty result
  );
}
