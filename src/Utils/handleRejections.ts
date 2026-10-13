let installed = false;

// EventEmitter and timer callbacks do not await async BLE command handlers.
// Network rejections must not turn an outage into a Node process restart.
export const handleRejections = () => {
  if (installed) return;
  installed = true;
  process.on('unhandledRejection', (reason) => {
    console.error('[Smartbed] Async operation failed; process remains running:', reason);
  });
};
