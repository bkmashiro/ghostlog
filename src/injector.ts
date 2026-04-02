export function generateInjectionScript(): string {
  return `
(function () {
  const __ghostlog_prefix = '__GHOSTLOG__';
  const __ghostlog_send = (payload) => {
    try {
      console.log(__ghostlog_prefix + JSON.stringify(payload));
    } catch {}
  };

  if (typeof globalThis.fetch === 'function' && !globalThis.__ghostlog_original_fetch) {
    globalThis.__ghostlog_original_fetch = globalThis.fetch;
    globalThis.fetch = async function (...args) {
      const req = {
        type: 'network',
        transport: 'fetch',
        url: String(args[0]),
        method: String(args[1]?.method || 'GET').toUpperCase(),
        time: Date.now()
      };
      try {
        const res = await globalThis.__ghostlog_original_fetch.apply(this, args);
        __ghostlog_send({ ...req, status: res.status, duration: Date.now() - req.time, timestamp: Date.now() });
        return res;
      } catch (error) {
        __ghostlog_send({ ...req, error: String(error), duration: Date.now() - req.time, timestamp: Date.now() });
        throw error;
      }
    };
  }

  if (typeof globalThis.XMLHttpRequest === 'function' && !globalThis.__ghostlog_original_xhr_open) {
    const OriginalXHR = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = function GhostLogXHR() {
      const xhr = new OriginalXHR();
      let method = 'GET';
      let url = '';
      let startedAt = 0;
      const open = xhr.open;
      xhr.open = function (...args) {
        method = String(args[0] || 'GET').toUpperCase();
        url = String(args[1] || '');
        return open.apply(this, args);
      };
      const send = xhr.send;
      xhr.send = function (...args) {
        startedAt = Date.now();
        xhr.addEventListener('loadend', function () {
          __ghostlog_send({
            type: 'network',
            transport: 'xhr',
            method,
            url,
            status: xhr.status,
            duration: Date.now() - startedAt,
            timestamp: Date.now()
          });
        }, { once: true });
        return send.apply(this, args);
      };
      return xhr;
    };
  }

  if (typeof console.time === 'function' && typeof console.timeEnd === 'function' && !console.__ghostlog_original_time) {
    const timeMap = new Map();
    console.__ghostlog_original_time = console.time.bind(console);
    console.__ghostlog_original_timeEnd = console.timeEnd.bind(console);
    console.time = function (label = 'default') {
      timeMap.set(String(label), Date.now());
      __ghostlog_send({ type: 'timing', phase: 'start', label: String(label), timestamp: Date.now() });
      return console.__ghostlog_original_time(label);
    };
    console.timeEnd = function (label = 'default') {
      const key = String(label);
      const startTime = timeMap.get(key);
      const endTime = Date.now();
      __ghostlog_send({
        type: 'timing',
        phase: 'end',
        label: key,
        startTime,
        endTime,
        duration: typeof startTime === 'number' ? endTime - startTime : undefined,
        timestamp: endTime
      });
      timeMap.delete(key);
      return console.__ghostlog_original_timeEnd(label);
    };
  }
})();
`.trim()
}
