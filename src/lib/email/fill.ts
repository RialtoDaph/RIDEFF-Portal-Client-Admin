/** Fills {Variablen} in a template body ("Hallo {Vorname}, …"). Unknown variables stay visible. */
export function fillTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (all, k: string) => vars[k] ?? all);
}
