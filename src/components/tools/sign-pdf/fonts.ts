// Handwriting fonts for typed signatures (all include Vietnamese). Only loaded on the Sign PDF page.
import { Dancing_Script, Great_Vibes, Ms_Madi, Square_Peg } from "next/font/google";

const madi = Ms_Madi({ weight: "400", subsets: ["latin", "vietnamese"], display: "swap", preload: false });
const vibes = Great_Vibes({ weight: "400", subsets: ["latin", "vietnamese"], display: "swap", preload: false });
const dancing = Dancing_Script({ weight: "500", subsets: ["latin", "vietnamese"], display: "swap", preload: false });
const peg = Square_Peg({ weight: "400", subsets: ["latin", "vietnamese"], display: "swap", preload: false });

export const HAND_FONTS = [
  { name: "Signature", family: madi.style.fontFamily, scale: 1.15 },
  { name: "Formal", family: vibes.style.fontFamily, scale: 1 },
  { name: "Casual", family: dancing.style.fontFamily, scale: 0.9 },
  { name: "Marker", family: peg.style.fontFamily, scale: 1.1 },
];
