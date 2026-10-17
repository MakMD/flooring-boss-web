export function readProjectListState(key) {
  try {
    const state = JSON.parse(sessionStorage.getItem(key));
    return state && typeof state === "object" ? state : {};
  } catch {
    return {};
  }
}

export function writeProjectListState(key, state) {
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* Storage may be disabled. */
  }
}
