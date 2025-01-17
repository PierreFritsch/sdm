const xssec = require("@sap/xssec");
const cds = require("@sap/cds");
const requests = xssec.requests;
const NodeCache = require("node-cache");
const cache = new NodeCache();

const {
  getExistingAttachments
} = require("../../lib/persistence");

async function fetchAccessToken(credentials, jwt) {
  let decoded_token_jwt = decodeAccessToken(jwt);
  let access_token = cache.get(decoded_token_jwt.email); // to check if token exists
  if (access_token === undefined) {
    access_token = await generateSDMBearerToken(credentials, jwt);
    let user = decodeAccessToken(access_token).email;
    cache.set(user, access_token, 11 * 3600); //expires after 11 hours
  } else {
    let decoded_token = decodeAccessToken(access_token);
    if (isTokenExpired(decoded_token.exp)) {
      access_token = generateSDMBearerToken(credentials, jwt);
      cache.del(decoded_token.email);
      cache.set(decoded_token.email, access_token, 11 * 3600); //expires after 11 hours
    }

  }
  return access_token;
}
async function generateSDMBearerToken(credentials, jwt) {
  return new Promise(function (resolve, reject) {
    requests.requestUserToken(
      jwt,
      credentials.uaa,
      null, null, null, null, (error, response) => {
        if (error) {
          console.error(
            `Response error while fetching access token ${response.statusCode}`
          );
          reject(err);
        } else {
          resolve(response);
          return response;
        }
      }
    );
  });
}
function isTokenExpired(exp) {
  const expiry = new Date(exp * 1000);
  const now = new Date();
  return now > expiry;
}

function isRepositoryVersioned(repoInfo, repositoryId) {
  let repoType = repoInfo.data[repositoryId].capabilities["capabilityContentStreamUpdatability"]
  if (repoType === "pwconly") {
    repoType = "versioned";
  } else {
    repoType = "non-versioned";
  }
  saveRepoToCache(repositoryId, repoType);
  return repoType === "versioned" ? true : false;
}

function saveRepoToCache(repositoryId, type) {
  const repoType = cache.get(repositoryId);
  if (repoType === undefined) {
    cache.set(repositoryId, type, 60 * 60 * 24 * 60);
  }
}

function decodeAccessToken(jwtEncoded) {
  const jwtBase64Encoded = jwtEncoded.split('.')[1];
  const jwtDecodedAsString = Buffer.from(jwtBase64Encoded, 'base64').toString('ascii');
  return JSON.parse(jwtDecodedAsString);
}

async function getClientCredentialsToken(credentials) {
  const access_token = cache.get("SDM_ACCESS_TOKEN"); // to check if token exists
  if (access_token === undefined) {
    return new Promise(function (resolve, reject) {
      requests.requestClientCredentialsToken(
        null,
        credentials.uaa,
        null,
        (error, response) => {
          if (error) {
            console.error(
              `Response error while fetching access token ${response.statusCode}`
            );
            reject(err);
          } else {
            cache.set("SDM_ACCESS_TOKEN", response, 11*3600); //expires after 11 hours
            resolve(response);
          }
        }
      );
    });
  } else {
    return access_token;
  }
}

function getConfigurations() {
  return cds.env.requires?.["sdm"]?.settings || {};
}

async function checkAttachmentsToRename(attachment_val_rename, attachmentIDs, attachments){
  let modifiedAttachments = [];
  if(attachment_val_rename.length>0){
    const matchedAttachments = await getExistingAttachments(attachmentIDs, attachments);
    attachment_val_rename.forEach(draftAttachment => {
      const correspondingAttachment = matchedAttachments.find(attachment => attachment.ID === draftAttachment.ID);
      if(correspondingAttachment && correspondingAttachment.filename !== draftAttachment.filename) {
        modifiedAttachments.push({ID:draftAttachment.ID, url: draftAttachment.url, name: draftAttachment.filename, prevname: correspondingAttachment.filename,folderId:correspondingAttachment.folderId});
      }
    });
  }

  return modifiedAttachments
}

module.exports = {
  fetchAccessToken,
  getConfigurations,
  checkAttachmentsToRename,
  isRepositoryVersioned,
  getClientCredentialsToken
};
