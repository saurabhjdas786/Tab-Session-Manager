import browser from "webextension-polyfill";
import moment from "moment";
import log from "loglevel";
import getSessions from "./getSessions";
import { getSettings } from "../settings/settings";

const logDir = "background/export";

export default async function exportSessions(id = null, folderName = "", isBackup = false) {
  log.log(logDir, "exportSessions()", id, folderName, isBackup);
  let sessions = await getSessions(id);
  if (sessions == undefined) return;
  if (!Array.isArray(sessions)) sessions = [sessions];

  const downloadUrl = URL.createObjectURL(
    new Blob([JSON.stringify(sessions, null, "  ")], {
      type: "application/json"
    })
  );

  const replacedFolderName = replaceFolderName(folderName);
  const fileName = generateFileName(sessions, isBackup);

  const downloadId = await browser.downloads
    .download({
      url: downloadUrl,
      filename: `${replacedFolderName}${fileName}.json`,
      conflictAction: isBackup ? "overwrite" : "uniquify",
      saveAs: !isBackup
    })
    .catch(e => {
      log.warn(logDir, "exportSessions()", e);
      URL.revokeObjectURL(downloadUrl);
    });

  if (downloadId) recordDownloadUrl(downloadId, downloadUrl, isBackup);
}

function generateFileName(sessions, isBackup) {
  let fileName;
  if (sessions.length == 1) {
    const tagsText = sessions[0].tag.map(tag => `#${tag}`).join(" ");
    const dateText = moment(sessions[0].date).format(getSettings("dateFormat"));
    if (isBackup) fileName = `${dateText} - ${sessions[0].name} ${tagsText} - [${sessions[0].id}]`;
    else fileName = `${sessions[0].name} ${tagsText} - ${dateText}`;
  }
  else {
    const sessionLabel = browser.i18n.getMessage("sessionLabel");
    const sessionsLabel = browser.i18n.getMessage("sessionsLabel");
    const sessionsCount = `${sessions.length} ${sessions.length === 1 ? sessionLabel : sessionsLabel}`;
    fileName = `${sessionsCount} - ${moment().format(getSettings("dateFormat"))}`;
  }

  const pattern = /\\|\/|\:|\?|\.|"|<|>|\|/g;
  fileName = fileName.replace(pattern, "-").replace(/^( )+/, "");
  return fileName;
}

function replaceFolderName(folderName) {
  const specialChars = /\:|\?|\.|"|<|>|\|/g; //使用できない特殊文字
  const backSlash = /\\/g; //単一のバックスラッシュ
  const spaces = /\s\s+/g; //連続したスペース
  const slashs = /\/\/+/g; //連続したスラッシュ
  const sandwich = /(\s\/|\/\s)+(\s|\/)?/g; //スラッシュとスペースが交互に出てくるパターン
  const beginningEnd = /^(\s|\/)+|(\s|\/)+$/g; //先頭と末尾のスペース,スラッシュ

  folderName = folderName
    .replace(specialChars, "-")
    .replace(backSlash, "\/")
    .replace(spaces, " ")
    .replace(slashs, "\/")
    .replace(sandwich, "\/")
    .replace(beginningEnd, "");

  if (folderName !== "") folderName += "\/";
  return folderName;
}

let downloadRecords = {};

export const handleDownloadsChanged = (status) => {
  const downloadUrl = downloadRecords[status.id]?.downloadUrl;
  if (!downloadUrl) return;

  if (status.state?.current === "complete") revokeDownloadUrl(status.id);
  if (status?.error?.current === "FILE_FAILED") {
    log.error(logDir, "handleDownloadsChanged()", "failed", status, downloadRecords[status.id]);
    revokeDownloadUrl(status.id);
  }
};

const recordDownloadUrl = (downloadId, downloadUrl, isBackup) => {
  downloadRecords[downloadId] = { downloadUrl, isBackup };
};

const revokeDownloadUrl = (downloadId) => {
  const { downloadUrl, isBackup } = downloadRecords[downloadId];
  if (isBackup) browser.downloads.erase({ id: downloadId });
  URL.revokeObjectURL(downloadUrl);
  delete downloadRecords[downloadId];
};