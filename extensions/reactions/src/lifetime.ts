import type { Disposable } from "@chatgptx/api";

export function combineDisposables(
  ...resources: readonly Disposable[]
): Disposable {
  let disposed = false;

  return Object.freeze({
    dispose(): void {
      if (disposed) return;
      disposed = true;

      for (const resource of [...resources].reverse()) {
        try {
          resource.dispose();
        } catch (error: unknown) {
          console.error("[reactions] Cleanup failed", error);
        }
      }
    },
  });
}

export function bindToLifetime(
  lifetime: AbortSignal,
  resource: Disposable,
): Disposable {
  let disposed = false;

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    lifetime.removeEventListener("abort", dispose);
    resource.dispose();
  };

  if (lifetime.aborted) {
    dispose();
  } else {
    lifetime.addEventListener("abort", dispose, { once: true });
  }

  return Object.freeze({ dispose });
}
