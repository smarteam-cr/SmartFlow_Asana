const ACCENTED = ['á', 'é', 'í', 'ó', 'ú', 'ñ'];
const PLAIN = ['a', 'e', 'i', 'o', 'u', 'n'];

export function normalizeText(value) {
  let result = String(value).trim().toLowerCase();

  ACCENTED.forEach((accented, i) => {
    result = result.split(accented).join(PLAIN[i]);
  });

  return result.replace(/\s+/g, ' ').trim();
}
