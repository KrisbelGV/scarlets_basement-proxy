const catchAsync = require('../utils/catchAsync');
const createAbortController = require('../utils/createAbortController');
const {
  getProjectDataFromId,
  searchProjectsGeneralFromId
} = require('../services/filterService');

exports.getProjectDataFromIndex = catchAsync(async function getProjectDataFromIndex(req, res, next) {
  const signal = createAbortController();

  const projectId = res.locals.projectid;

  const includeSearchData = false;
  const includeStats = true;
  const projectData = await getProjectDataFromId(projectId, includeSearchData, includeStats, signal);

  let found = await searchProjectsGeneralFromId(projectData.projectId, projectData.title, signal);
  if(Object.keys(found).length === 0) {
    found = await searchProjectsGeneralFromId(projectData.projectId, projectData.userName, signal);
  }
  found = Object.keys(found).length === 0 ?
    {results:projectData, message:"No index"}
    : {results:found, message:"Index"};

  return res.status(200).json({
    ...found,
    aborted: signal.aborted
  });
});