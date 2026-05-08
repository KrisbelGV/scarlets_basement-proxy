const {
  fetchRawUserData,
  fetchSampleFollowers,
  fetchRawFollowersByYield,
  fetchSampleFollowing,
  fetchRawFollowingByYield,
  fetchSampleProjects,
  fetchRawProjectsFromProfileByYield,
  fetchRawProjectsFromSearchByYield,
  fetchRawProjectDataFromId,
  fetchRawStudioFromSearchByYield
} = require('../services/proxyService');

const { isAStringFromArrayInString } = require('../middleware/validator');

const REGEX_HASHTAG = /(?<=#)\w+/g;

exports.filterUserData = async function filterUserData(userName, signal) {
  if(signal?.aborted) return {};
  const data = await fetchRawUserData(userName);
  let userData = {
    userName: data.username,
    id: data.id
  };
  return userData;
};

const countResponsesLength = async (paginator, signal) => {
  let count = 0;
  let page = 0;
  for await (const pages of paginator) {
    page += 1;
    count += pages.length;
    if(signal?.aborted || page > 5) break;
  }
  return count;
};

const explorer = async (userName, type, maxRequest) => {
  const offset = maxRequest * 40;
  let sample;
  switch(type) {
    case 'followers':
      sample = await fetchSampleFollowers(userName, offset);
      break;
    case 'following':
      sample = await fetchSampleFollowing(userName, offset);
      break;
    case 'projects':
      sample = await fetchSampleProjects(userName, offset);
      break;
  }
  const isAMassiveAccount = Array.isArray(sample) && sample.length > 0;
  return isAMassiveAccount;
};

exports.countNumberFollowers = async function countNumberFollowers(userName, signal) {
  if(signal?.aborted) return 0;
  const isAMassiveAccount = await explorer(userName, 'followers', 5);
  if(isAMassiveAccount) return 200;
  const followersPaginator = fetchRawFollowersByYield(userName);
  return await countResponsesLength(followersPaginator, signal);
};

exports.countNumberFollowing = async function countNumberFollowing(userName, signal) {
  if(signal?.aborted) return 0;
  const isAMassiveAccount = await explorer(userName, 'following', 5);
  if(isAMassiveAccount) return 200;
  const followingPaginator = fetchRawFollowingByYield(userName);
  return await countResponsesLength(followingPaginator, signal);
};

exports.calculateStats = async function calculateStats(userName, signal) {
  const stats = {
    sharedProjects: 0,
    views: 0,
    loves: 0,
    favorites: 0
  };
  if(signal?.aborted) return stats;
  const projectsPaginator = fetchRawProjectsFromProfileByYield(userName);
  for await (const projects of projectsPaginator){
    if(signal?.aborted) break;
    stats.sharedProjects += projects.length;
    for(const project of projects){
      stats.views += project.stats.views;
      stats.loves += project.stats.loves;
      stats.favorites += project.stats.favorites;
    }
  }
  return stats;
};

exports.validateFollowing = async function validateFollowing(userName, profiles, signal) {
  let followingProfiles = [];
  if(signal?.aborted) return followingProfiles;
  const followingPaginator = fetchRawFollowingByYield(userName);
  let page = 0;

  master: for await (const following of followingPaginator){
    page += 1;
    if(signal?.aborted || page > 9) break;

    for (const individualFollowing of following){
      const followingUserName = individualFollowing.username.toLowerCase();
      const followingId = individualFollowing.id;

      for(let i = profiles.length - 1; i >= 0; i--){
        const profileUserName = profiles[i].toLowerCase();

        if(profileUserName === followingUserName){
          followingProfiles.push({
            userName: followingUserName,
            id: followingId
          });
          profiles.splice(i, 1);
        }
      }
      
      if(profiles.length === 0) break master;
    }
  }

  return followingProfiles;
};

exports.searchProjectsByProfiles = async function searchProjectsByProfiles(q, discard, profiles, signal) {
  let projectsFound = [];
  if(signal?.aborted) return projectsFound;
  const query = q.toLowerCase();
  
  for (const profile of profiles){
    if(signal?.aborted) break;
    let projectsPaginator = fetchRawProjectsFromProfileByYield(profile.userName);
    const projectsByProfile = {
      userName: profile.userName,
      id: profile.id,
      projects: []
    };

    for await (const projects of projectsPaginator){
      if(signal?.aborted || projects.length === 0) break;

      for(const project of projects) {
        let projectText = `${project.title} ${project.instructions} ${project.description}`;

        if(discard.length !== 0 && isAStringFromArrayInString(discard, projectText)) continue;

        if(projectText.toLowerCase().includes(query)) {
          projectsByProfile.projects.push({
            projectId: project.id,
            title: project.title,
          });
        }
      }
    }

    if(projectsByProfile.projects.length > 0) projectsFound.push(projectsByProfile);
  }

  return projectsFound;
};

exports.searchProjectsGeneralFromQuery = async function searchProjectsGeneralFromQuery(q, mode, discard, signal) {
  const projectsFound = [];
  if(signal?.aborted) return projectsFound;
  const params = {q: encodeURIComponent(q), mode: mode};
  const projectsPaginator = fetchRawProjectsFromSearchByYield(params);

  for await (const projects of projectsPaginator){
    if(signal?.aborted) break;

    for(const project of projects) {
      if(discard.length !== 0){
        let projectText = `${project.title} ${project.instructions} ${project.description}`;
        if(isAStringFromArrayInString(discard, projectText)) continue;
      }

      projectsFound.push({
        projectId: project.id,
        title: project.title,
        userName: project.author.username,
        userId: project.author.id
      })
    }
  }

  return projectsFound;
};

const extractHashtagsWords = (text) => {
  return text.match(REGEX_HASHTAG);
};

exports.getTagsFromProject = function getTagsFromProject(projectData, signal) {
  if(signal?.aborted) return [];
  const projectText = `${projectData.title} ${projectData.instructions} ${projectData.description}`.toLowerCase();
  let tags = extractHashtagsWords(projectText) || [];
  return tags.slice(0, 3);
}

exports.getProjectDataFromId = async function getProjectDataFromId(projectId, includeSearchData=false, includeStats=false, signal) {
  if(signal?.aborted) return {};
  const project = await fetchRawProjectDataFromId(projectId);
  const projectData = {
    projectId: project.id,
    title: project.title,
    userId: project.author.id,
    userName: project.author.username
  }
  if(includeSearchData){
    projectData.instructions = project.instructions,
    projectData.description = project.description
  }
  if(includeStats) projectData.stats = project.stats;
  return projectData;
};

exports.searchStudioFromTags = async function searchStudioFromTags(tags, signal) {
  const studiosFound = [];
  if(signal?.aborted) return studiosFound;

  for(const tag of tags){
    const params = {q: tag, mode: ''};
    const studiosPaginator = fetchRawStudioFromSearchByYield(params);

    for await (const studios of studiosPaginator){
      if(signal?.aborted) break;

      for(const studio of studios) {
        if(!studio.open_to_all) continue
        studiosFound.push({
          id: studio.id,
          title: studio.title,
        });
        if(signal?.aborted) break;
      }
    }
  }

  return studiosFound;
};

exports.searchProjectsGeneralFromId = async function searchProjectsGeneralFromId(projectId, titleOrUserName, signal) {
  if(signal?.aborted) return {};

  const params = {q: encodeURIComponent(titleOrUserName), mode: ''};
  const projectsPaginator = fetchRawProjectsFromSearchByYield(params);

  for await (const projects of projectsPaginator){
    if(signal?.aborted) return {};
    for(const project of projects){
      if(project.id === projectId){
        return {
          projectId: project.id,
          title: project.title,
          userName: project.author.username,
          userId: project.author.id,
          stats: project.stats
        };
      }
    }
  }

  return {};
};

exports.getFollowingProjects = async function getFollowingProjects(userName, signal) {
  let foundProjects = [];
  if(signal?.aborted) return foundProjects;

  const followingPaginator = fetchRawFollowingByYield(userName);

  master: for await (const following of followingPaginator){
    if(signal?.aborted) break;
    
    for (const individualFollowing of following){
      if(signal?.aborted) break;
      const followingUserName = individualFollowing.username;
      const followingId = individualFollowing.id;
      const paginateProjects = fetchRawProjectsFromProfileByYield(followingUserName);
      const projectsByFollowing = {
        userName: followingUserName,
        id: followingId,
        projects: []
      }

      for await (const projects of paginateProjects){
        if(signal?.aborted) break;

        for(const project of projects){
          if(signal?.aborted) break;
          
          const views = project.stats.views;
          const favorites = project.stats.favorites;

          if(views >= 10 && favorites >= 2){
            projectsByFollowing.projects.push({
              projectId: project.id,
              title: project.title,
            });
          }
        }
      }

      if(projectsByFollowing.projects.length !== 0) foundProjects.push(projectsByFollowing);
    }
  }

  return foundProjects;
};