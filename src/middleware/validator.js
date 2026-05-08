class InputError extends Error {
  constructor(message, status) {
    super(message);
    this.name = this.constructor.name;
    this.status = status || 400;
    Error.captureStackTrace(this, this.constructor);
  }
};
exports.InputError =  InputError;

const REGEX_USER_NAME = /^[a-zA-Z0-9-_]+$/;
const DANGEROUS_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

const isValidUserName = (userName) => {
  return typeof userName === 'string'
  && userName.length >= 3
  && userName.length <= 30
  && REGEX_USER_NAME.test(userName);
};

const hasValidCharacters = (string) => {
  return typeof string === 'string' && !DANGEROUS_CHARS.test(string);
};

exports.validateUserName = function validateUserName (req, res, next) {
  const queryUserName = req.query.username;
  const paramsUserName = req.params.username;

  if((queryUserName && !isValidUserName(queryUserName))
    || (paramsUserName && !isValidUserName(paramsUserName))) {
    throw new InputError('Invalid username format', 422);
  }
  res.locals.queryusername = queryUserName;
  res.locals.paramsusername = paramsUserName;

  next();
};

exports.validateProfiles = function validateProfiles (req, res, next) {
  const profile = req.query.profile;
  let profiles = [];

  if(profile) {
    if(Array.isArray(profile)) {
      if(profile.length > 5) {
        throw new InputError('Too many profiles', 422);
      }
      const seen = new Set();
      profiles = profile
        .filter(user => isValidUserName(user))
        .filter(user => {
          const lower = user.toLowerCase();
          if (seen.has(lower)) return false;
          seen.add(lower);
          return true;
        });
      if(profiles.length === 0) {
        throw new InputError('Invalid profile format', 422);
      }
    }
    else {
      if(!isValidUserName(profile)) {
        throw new InputError('Invalid profile format', 422);
      }
      profiles.push(profile);
    }
  }
  res.locals.profiles = profiles;

  next();
};

const isValidString = (string) => {
  return typeof string === 'string'
  && !(['', 'null', 'undefined'].includes(string.trim()));
};

const cleanStringArray = (array) => {
  return array
    .filter(string => isValidString(string))
    .map(string => string.trim());
};

const cleanSingleWords = (array) => {
  return cleanStringArray(array)
    .map(word => word.trim().split(/\s+/)[0])
    .filter(word => word.length > 0 && word.length <= 30)
    .filter((word, index, arr) => arr.indexOf(word) === index);
};

const isAStringFromArrayInString = (stringArray, string) => {
  string = string.toLowerCase();
  return stringArray
    .some(str => string.includes(str.toLowerCase()))
};
exports.isAStringFromArrayInString = isAStringFromArrayInString;

exports.validateSearchParams = function validateSearchParams (req, res, next) {
  let {q, mode, discard} = req.query;

  if(Array.isArray(q)) throw new InputError('Invalid query format', 422);
  if(!isValidString(q)) throw new InputError('Required query', 400);
  if(!hasValidCharacters(q)) {
    throw new InputError('Query contains invalid characters', 422);
  }
  if(mode && (Array.isArray(mode)
    || mode !== 'trending')) {
    throw new InputError('Invalid mode format', 422);
  }
  if(discard) {
    if(Array.isArray(discard)) {
      if(discard.length > 10) {
        throw new InputError('Too many discard words', 422);
      }
      discard = cleanSingleWords(discard);
      if(discard.length === 0
        || isAStringFromArrayInString(discard, q)) {
        throw new InputError('Invalid discard format', 422);
      }
      if(discard.some(word => !hasValidCharacters(word))) {
        throw new InputError('Discard contains invalid characters', 422);
      }
    }
    else {
        if(!isValidString(discard)) {
          throw new InputError('Invalid discard format', 422);
        }
        if(!hasValidCharacters(discard)) {
          throw new InputError('Discard contains invalid characters', 422);
        }
        const cleaned = cleanSingleWords([discard]);
        discard = cleaned.length > 0 ? cleaned : [];
        if(discard.length === 0
          || isAStringFromArrayInString(discard, q)) {
          throw new InputError('Invalid discard format', 422);
        }
    }
  }
  res.locals.q = q.trim().slice(0, 30);
  res.locals.mode = mode || '';
  res.locals.discard = discard || [];

  next();
};

const projectIdValid = (projectID) => {
  return projectID > 0 && projectID < 10000000000;
}

exports.validateProject = function validateProject (req, res, next) {
  const projectId = req.params.projectid;

  if(!projectId) throw new InputError('Required project ID', 400);
  if(!Number.isInteger(Number(projectId))) throw new InputError('Project ID is not an integer.', 422);
  if(!projectIdValid(projectId)) throw new InputError('Invalid project ID', 422);
  res.locals.projectid = projectId;

  next();
};

exports.validateUserTags = function validateUserTags (req, res, next) {
  let userTags = req.query.tag;

  if(userTags) {
    if(Array.isArray(userTags)) {
      if(userTags.length > 3) {
        throw new InputError('Too many tags', 422);
      }
      userTags = cleanSingleWords(userTags);
      if(userTags.length === 0) {
        throw new InputError('Invalid tag format', 422);
      }
      if(userTags.some(tag => !hasValidCharacters(tag))) {
        throw new InputError('Tag contains invalid characters', 422);
      }
    }
    else {
      if(!isValidString(userTags)) {
        throw new InputError('Invalid tag format', 422);
      }
      if(!hasValidCharacters(userTags)) {
        throw new InputError('Tag contains invalid characters', 422);
      }
      const cleaned = cleanSingleWords([userTags]);
      userTags = cleaned.length > 0 ? cleaned : [];
    }
  }
  res.locals.tag = userTags || [];

  next();
};