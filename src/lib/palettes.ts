export type Palette = {
  id: string;
  name: string;
  colors: readonly string[];
};

export const PALETTES: readonly Palette[] = [
  { id: "starlight", name: "Starlight", colors: ["#d5dde6", "#8ea0b5", "#f4f1ea", "#5d6f86"] },
  { id: "copper", name: "Copper", colors: ["#e0a36a", "#f3e6d4", "#b86a45", "#f0d2b0"] },
  { id: "river", name: "River", colors: ["#8ec3c9", "#e7f1ef", "#3f7f8c", "#c5ddd6"] },
  { id: "pine", name: "Pine", colors: ["#b7cbb8", "#e4eee4", "#6e9474", "#d5e2cf"] },
  { id: "rose", name: "Rose ash", colors: ["#e3bdb6", "#f4ece4", "#b56d68", "#c98980"] },
] as const;

export function paletteById(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
}
