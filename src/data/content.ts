import raw from './content.json';

export interface Media { src: string; w: number; h: number; type: 'image' | 'video'; poster?: string; thumb: string; label?: string; name?: string; kind?: string }
export interface WorldItem { id: string; title: string; jp: string; sub: string; year: string; note: string; tags: string[]; plate: Media; alt: string; shots: Media[]; screen: string }
export interface Client { name: string; group: string; role: string; files: Media[]; cover: string | null }
export interface Tier { n: string; name: string; for: string; items: string[]; flag?: string }
export interface Profile {
  name: string; short: string; role: string; city: string; coords: string; email: string; line: string; about: string[];
  tools: Record<string, string>; links: [string, string][]; desk: string;
}
export interface Content { profile: Profile; worlds: WorldItem[]; steps: [string, string][]; clients: Client[]; studies: Media[]; tiers: Tier[] }

export const content = raw as unknown as Content;

/** Public asset path → URL that works under any base path. */
export const asset = (p: string) => (p.startsWith('http') ? p : `./${p}`);

/** The pieces hung in the archive hall: world plates and stills, then one piece per client. */
export const archive: Media[] = (() => {
  const out: Media[] = [];
  for (const w of content.worlds) out.push({ ...w.plate, name: w.title, kind: `${w.jp} · personal world` });
  for (const w of content.worlds) {
    for (const s of w.shots) if (s.type === 'image' && out.length < 9) out.push({ ...s, name: w.title, kind: s.label ?? 'personal world' });
  }
  for (const c of content.clients) {
    const f = c.files.find((x) => x.type === 'image');
    if (f && out.length < 16) out.push({ ...f, name: c.name, kind: c.role });
  }
  return out;
})();
