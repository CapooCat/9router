// Route paths the dashboard guard must special-case for 2FA.
//
// Kept here so `src/dashboardGuard.js` only ever needs one import + two spreads:
// any future 2FA route is registered in this file, not in the guard.
//
// IMPORTANT — `2fa-challenge` and `2fa-pending` are flat siblings, NOT children of
// `/api/auth/2fa`. PUBLIC_API_PATHS matches `pathname === p || startsWith(p + "/")`,
// so a public `/api/auth/2fa` entry would also expose every enrollment route under it.
// A leaf path that can never acquire children cannot be widened by accident later.
export const TWO_FACTOR_PUBLIC_PATHS = [
  "/api/auth/2fa-challenge",
  "/api/auth/2fa-pending",
];

// LOCAL_ONLY_PATHS uses bare `startsWith(p)` with no "/" boundary — entries must be
// full leaf paths or they gate their prefix-siblings too.
export const TWO_FACTOR_LOCAL_ONLY_PATHS = [
  "/api/auth/2fa/reset",
];
