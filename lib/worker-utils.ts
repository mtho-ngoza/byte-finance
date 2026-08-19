/**
 * Run a Web Worker and return its result, with a timeout fallback
 */
export function runWorker<T>(
  workerPath: string,
  message: object,
  timeoutMs = 15000
): Promise<T> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(workerPath);
    } catch (err) {
      reject(err);
      return;
    }

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error(`Worker ${workerPath} timed out`));
    }, timeoutMs);

    worker.onmessage = (event) => {
      clearTimeout(timer);
      worker.terminate();
      if (event.data.error) {
        reject(new Error(event.data.error));
      } else {
        resolve(event.data as T);
      }
    };

    worker.onerror = (err) => {
      clearTimeout(timer);
      worker.terminate();
      reject(err);
    };

    worker.postMessage(message);
  });
}
