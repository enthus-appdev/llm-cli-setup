import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Detect user's shell and return the profile file path
 */
export const getShellProfile = () => {
  const shell = process.env.SHELL || '';
  const homeDir = os.homedir();

  if (shell.includes('zsh')) {
    return { shell: 'zsh', profilePath: path.join(homeDir, '.zshrc') };
  }

  if (shell.includes('bash')) {
    const bashProfile = path.join(homeDir, '.bash_profile');
    const bashrc = path.join(homeDir, '.bashrc');

    if (process.platform === 'darwin' && fs.existsSync(bashProfile)) {
      return { shell: 'bash', profilePath: bashProfile };
    }
    return { shell: 'bash', profilePath: bashrc };
  }

  return { shell: 'unknown', profilePath: path.join(homeDir, '.profile') };
};

/**
 * Check if a block exists in file content
 */
export const hasBlock = (content, startMarker) => {
  return content.includes(startMarker);
};

/**
 * Remove a block of content between markers
 */
export const removeBlock = (content, startMarker, endMarker) => {
  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    return content;
  }

  const before = content.substring(0, startIndex).replace(/\n+$/, '\n');
  const after = content.substring(endIndex + endMarker.length).replace(/^\n+/, '\n');

  return before + after;
};

/**
 * Replace a block in content or append if not exists
 */
export const replaceOrAppendBlock = (content, startMarker, endMarker, newBlock) => {
  if (hasBlock(content, startMarker)) {
    const blockRegex = new RegExp(
      `${escapeRegex(startMarker)}[\\s\\S]*?${escapeRegex(endMarker)}`,
      'g'
    );
    return content.replace(blockRegex, newBlock);
  }
  return content.trimEnd() + '\n\n' + newBlock + '\n';
};

/**
 * Escape special regex characters
 */
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Ensure directory exists
 */
export const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return true;
  }
  return false;
};

/**
 * Read file safely, return empty string if not exists
 */
export const readFileSafe = (filePath) => {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  return '';
};

/**
 * Write file with optional mode
 */
export const writeFileSecure = (filePath, content, mode = 0o644) => {
  fs.writeFileSync(filePath, content, { mode });
};
