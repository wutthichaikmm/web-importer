function copyWithTextarea(text) {
  const previousFocus = document.activeElement;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  previousFocus?.focus?.();
  if (!copied) throw new Error("คัดลอกไม่สำเร็จ");
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back when the Clipboard API is unavailable or blocked.
    }
  }
  copyWithTextarea(text);
}
