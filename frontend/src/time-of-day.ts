/**
 * How this viewer sees the town: by day or at night. It is cosmetic and local to this browser;
 * Vision and everything else the server decides are the same either way.
 */
export type TimeOfDay = "day" | "night";

const STORAGE_KEY = "pu-town.time-of-day";

function isTimeOfDay(value: unknown): value is TimeOfDay {
  return value === "day" || value === "night";
}

/** `?time=night` or `?time=day` wins, then this browser's last choice, then day. */
export function initialTimeOfDay(search: string, storage?: Pick<Storage, "getItem">): TimeOfDay {
  const asked = new URLSearchParams(search).get("time");
  if (isTimeOfDay(asked)) return asked;
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (isTimeOfDay(saved)) return saved;
  } catch { /* Storage can be blocked; day is fine. */ }
  return "day";
}

export function rememberTimeOfDay(time: TimeOfDay, storage?: Pick<Storage, "setItem">): void {
  try { storage?.setItem(STORAGE_KEY, time); } catch { /* Not remembered, still applied. */ }
}

export function otherTimeOfDay(time: TimeOfDay): TimeOfDay {
  return time === "day" ? "night" : "day";
}

/** The sun/moon button in the corner of the town, and the N key, switch the time of day. */
export class TimeOfDayToggle {
  readonly #button = document.createElement("button");
  readonly #keyDown = (event: KeyboardEvent) => {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (event.code === "KeyN" && !typing && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) this.toggle();
  };
  #time: TimeOfDay;

  constructor(initial: TimeOfDay, private readonly changed: (time: TimeOfDay) => void) {
    this.#time = initial;
    this.#button.type = "button";
    this.#button.className = "time-toggle";
    this.#button.addEventListener("click", () => this.toggle());
    (document.getElementById("stage") ?? document.body).append(this.#button);
    window.addEventListener("keydown", this.#keyDown);
    this.render();
  }

  get time(): TimeOfDay {
    return this.#time;
  }

  toggle(): void {
    this.#time = otherTimeOfDay(this.#time);
    this.render();
    this.changed(this.#time);
  }

  destroy(): void {
    window.removeEventListener("keydown", this.#keyDown);
    this.#button.remove();
  }

  private render(): void {
    const night = this.#time === "night";
    this.#button.textContent = night ? "☾ Night" : "☀ Day";
    this.#button.title = night ? "Switch to day (N)" : "Switch to night (N)";
    this.#button.setAttribute("aria-pressed", String(night));
    this.#button.setAttribute("aria-label", "Night time");
  }
}
