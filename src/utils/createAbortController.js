module.exports = function createAbortController() {
  const controller = new AbortController();
  const { signal } = controller;

  setTimeout(() => {
    controller.abort();
  }, 5000);

  return signal;
};