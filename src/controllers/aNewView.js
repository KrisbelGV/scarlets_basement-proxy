const {InputError} = require('../middleware/validator');
const catchAsync = require('../utils/catchAsync');
const createAbortController = require('../utils/createAbortController');
const { clearScratchFailure } = require('../utils/upstash');
const { getFollowingProjects } = require('../services/filterService');

exports.getProjectsFromFollowing = catchAsync(async function getProjectsFromFollowing(req, res, next) {
  const signal = createAbortController();

  const userName = res.locals.paramsusername;
  if(!userName) throw new InputError("Required username", 400);

  let found = await getFollowingProjects(userName, signal);
  found = found.length === 0 ?
    {results:"No search results"}
    : {results:found};

  if (res.locals.scratchWasDown) {
    await clearScratchFailure().catch(() => {});
  }
  
  return res.status(200).json({
    ...found,
    aborted: signal.aborted
  });
});