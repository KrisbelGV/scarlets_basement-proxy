const {InputError} = require('../middleware/validator');
const catchAsync = require('../utils/catchAsync');
const createAbortController = require('../utils/createAbortController');
const { clearScratchFailure } = require('../utils/upstash');
const {
  getProjectDataFromId,
  getTagsFromProject,
  searchStudioFromTags
} = require('../services/filterService');

exports.getStudioForAProject = catchAsync(async function getStudioForAProject(req, res, next) {
  const signal = createAbortController();

  const projectId = res.locals.projectid;
  const userTags = res.locals.tag;

  const includeSearchData = true;
  const projectData = await getProjectDataFromId(projectId, includeSearchData, signal);
  let tags = userTags.length !== 0 ? userTags : getTagsFromProject(projectData, signal);
  if(tags.length === 0) throw new InputError("No project or user tags", 422);
  let studiosFound = await searchStudioFromTags(tags, signal);
  studiosFound = studiosFound.length === 0 ?
    {results: 'No search results'}
    : {results: studiosFound};

  if (res.locals.scratchWasDown) {
    await clearScratchFailure().catch(() => {});
  }
  
  return res.status(200).json({
    ...studiosFound,
    aborted: signal.aborted
  });
});