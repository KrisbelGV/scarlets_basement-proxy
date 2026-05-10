const {InputError} = require('../middleware/validator');
const catchAsync = require('../utils/catchAsync');
const createAbortController = require('../utils/createAbortController');
const { clearScratchFailure } = require('../utils/upstash');
const {
  filterUserData,
  countNumberFollowers,
  countNumberFollowing,
  calculateStats
} = require('../services/filterService');

exports.getUserData = catchAsync(async function getUserData(req, res, next) {
  const signal = createAbortController();

  const userName = res.locals.paramsusername;
  if(!userName) throw new InputError('Required username', 400);

  let userData = await filterUserData(userName, signal);
  userData.followers = await countNumberFollowers(userName, signal);
  userData.following = await countNumberFollowing(userName, signal);
  userData.stats = await calculateStats(userName, signal);
  userData.aborted = signal.aborted;

  if (res.locals.scratchWasDown) {
    await clearScratchFailure().catch(() => {});
  }
  
  return res.status(200).json(userData);
});