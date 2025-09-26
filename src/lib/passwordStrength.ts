// src/lib/passwordStrength.ts
export type Strength = "weak" | "medium" | "strong";

export function scorePassword(pw: string): {
  strength: Strength;
  score: number;
} {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const strength: Strength =
    score >= 3 ? "strong" : score === 2 ? "medium" : "weak";
  return { strength, score };
}
