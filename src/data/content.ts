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
