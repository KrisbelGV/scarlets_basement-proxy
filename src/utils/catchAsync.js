module.exports = function catchAsync(fn) {
  const wrapper = (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      const isNormalOperation = 
        error.name === 'ProcessingError' || 
        error.name === 'RateLimitError' || 
        error.name === 'InputError' ||
        error.name === 'UpstashError' ||
        error.name === 'ExternalApiError';
      
      if (!isNormalOperation) {
        console.error(`[${error.name || 'Error'}] ${error.message}`);
        if (error.stack) console.error(error.stack);
      }
      
      next(error);
    });
  };
  
  Object.defineProperty(wrapper, 'name', { 
    value: fn.name || 'anonymous',
    writable: false 
  });
  
  return wrapper;
};