const createError = require('http-errors');
const { 
  registerScratchFailure,
  clearScratchFailure
} = require('../utils/upstash');

class ExternalApiError extends Error {
  constructor(status, message) {
    super(message);
    const baseError = createError(status, message);
    this.name = this.constructor.name;
    this.status = baseError.status;
    this.statusCode = baseError.statusCode;
    this.expose = baseError.expose;
    Error.captureStackTrace(this, this.constructor);
  }
}
exports.ExternalApiError = ExternalApiError;

const BASE_URL = 'https://api.scratch.mit.edu';
let lastApiCall = Date.now();

const validateStatus = (response) => {
  if (!response.ok) {
    throw new ExternalApiError(response.status, response.statusText);
  }
};

const requestExternalData = async (url) => {
  const now = Date.now();
  const diff = now - lastApiCall;
  
  if (diff < 200) {
    await new Promise(resolve => setTimeout(resolve, 200 - diff));
  }
  
  lastApiCall = Date.now();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    validateStatus(response);
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new ExternalApiError(408, 'Request timeout');
    }
    throw error;
  }
};

const protectedRequest = async (url) => {
  try {
    const result = await requestExternalData(url);
    
    await clearScratchFailure().catch(() => {});
    
    return result;
  } catch (error) {
    if (error.status >= 500 || error.status === 429) {
      await registerScratchFailure().catch(() => {});
    }
    throw error;
  }
};

exports.fetchRawUserData = async function fetchRawUserData(userName) {
  const url = `${BASE_URL}/users/${userName}`;
  return await protectedRequest(url);
};

const paginate = async function* (url, params = {}) {
  let limit = 40;
  let offset = 0;
  url = `${url}?`;
  
  if (Object.keys(params).length !== 0) {
    url = `${url}q=${params.q}&`;
    if (params.mode !== '') url = `${url}mode=${params.mode}&`;
  }
  
  while (true) {
    const currentUrl = `${url}limit=${limit}&offset=${offset}`;
    const data = await protectedRequest(currentUrl);
    if (data.length === 0) break;
    yield data;
    if (data.length < limit) break;
    offset += limit;
  }
};

const createPaginator = (endpoint, params = {}) => {
  const url = `${BASE_URL}${endpoint}`;
  return paginate(url, params);
};

exports.fetchSampleFollowers = function fetchSampleFollowers(userName, offset) {
  const url = `${BASE_URL}/users/${userName}/followers?limit=1&offset=${offset}`;
  return protectedRequest(url);
};

exports.fetchRawFollowersByYield = function fetchRawFollowersByYield(userName) {
  const endpoint = `/users/${userName}/followers`;
  return createPaginator(endpoint);
};

exports.fetchSampleFollowing = function fetchSampleFollowing(userName, offset) {
  const url = `${BASE_URL}/users/${userName}/following?limit=1&offset=${offset}`;
  return protectedRequest(url);
};

exports.fetchRawFollowingByYield = function fetchRawFollowingByYield(userName) {
  const endpoint = `/users/${userName}/following`;
  return createPaginator(endpoint);
};

exports.fetchSampleProjects = function fetchSampleProjects(userName, offset) {
  const url = `${BASE_URL}/users/${userName}/projects?limit=1&offset=${offset}`;
  return protectedRequest(url);
};

exports.fetchRawProjectsFromProfileByYield = function fetchRawProjectsFromProfileByYield(userName) {
  const endpoint = `/users/${userName}/projects`;
  return createPaginator(endpoint);
};

exports.fetchRawProjectsFromSearchByYield = function fetchRawProjectsFromSearchByYield(params) {
  const endpoint = `/search/projects`;
  return createPaginator(endpoint, params);
};

exports.fetchRawProjectDataFromId = async function fetchRawProjectDataFromId(projectId) {
  const url = `${BASE_URL}/projects/${projectId}`;
  return await protectedRequest(url);
};

exports.fetchRawStudioFromSearchByYield = function fetchRawStudioFromSearchByYield(params) {
  const endpoint = `/search/studios`;
  return createPaginator(endpoint, params);
};