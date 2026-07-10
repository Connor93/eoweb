const EXP_TABLE: number[] = [];

export function getExpForLevel(level: number): number {
  if (!EXP_TABLE.length) {
    fillExpTable();
  }

  return EXP_TABLE[level];
}

// Mirrors REOSERV's exp table: threshold(L) = (L^3.5 − 1) × 60, baseline-0 so
// level 1 requires 0 exp (a character is born at level 1). Keep in sync with
// src/main.rs `exp_table_for_max_level`. NOTE: this replaced a stale `i³ × 133.1`
// table that disagreed with the server (which made the HUD's TNL bar show a
// wrong denominator and sit at 0 for a fresh level-1 character).
function fillExpTable() {
  for (let i = 0; i < 254; ++i) {
    EXP_TABLE.push(Math.max(0, Math.round((i ** 3.5 - 1) * 60)));
  }
}
