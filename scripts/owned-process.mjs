import { spawn } from "node:child_process";

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function processGroupExists(processGroupId) {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

async function waitForProcessGroupExit(processGroupId, timeoutMilliseconds) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (processGroupExists(processGroupId)) {
    if (Date.now() >= deadline) return false;
    await sleep(25);
  }
  return true;
}

function signalProcessGroup(processGroupId, signal) {
  try {
    process.kill(-processGroupId, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

export async function terminateProcessGroup(
  processGroupId,
  { terminateMilliseconds = 2_000, killMilliseconds = 5_000 } = {},
) {
  if (!Number.isSafeInteger(processGroupId) || processGroupId <= 0) {
    throw new TypeError("Process group ID must be a positive integer");
  }
  signalProcessGroup(processGroupId, "SIGTERM");
  if (await waitForProcessGroupExit(processGroupId, terminateMilliseconds)) return;
  signalProcessGroup(processGroupId, "SIGKILL");
  if (!(await waitForProcessGroupExit(processGroupId, killMilliseconds))) {
    throw new Error(`Process group ${processGroupId} did not stop`);
  }
}

function commandLabel(executable, arguments_) {
  return [executable, ...arguments_].join(" ");
}

export async function runOwnedCommand(executable, arguments_, options = {}) {
  const timeoutMilliseconds = options.timeoutMilliseconds ?? 600_000;
  if (!Number.isSafeInteger(timeoutMilliseconds) || timeoutMilliseconds <= 0) {
    throw new TypeError("Command timeout must be a positive integer");
  }
  await new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, {
      cwd: options.cwd,
      detached: true,
      env: options.env ?? process.env,
      stdio: options.stdio ?? "inherit",
    });
    let timedOut = false;
    let finished = false;
    let termination;

    const stopGroup = () => {
      if (!termination && child.pid) {
        termination = terminateProcessGroup(child.pid);
        termination.catch(() => {});
      }
      return termination ?? Promise.resolve();
    };

    const timer = setTimeout(() => {
      timedOut = true;
      void stopGroup();
    }, timeoutMilliseconds);

    const finish = async (error, code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        await stopGroup();
      } catch (terminationError) {
        reject(terminationError);
        return;
      }
      if (error) {
        reject(error);
      } else if (timedOut) {
        reject(new Error(`${commandLabel(executable, arguments_)} timed out`));
      } else if (code !== 0) {
        reject(
          new Error(
            `${commandLabel(executable, arguments_)} failed with ${
              signal ? `signal ${signal}` : `exit ${code}`
            }`,
          ),
        );
      } else {
        resolve();
      }
    };

    child.once("error", (error) => {
      void finish(error);
    });
    child.once("exit", (code, signal) => {
      void finish(undefined, code, signal);
    });
  });
}
