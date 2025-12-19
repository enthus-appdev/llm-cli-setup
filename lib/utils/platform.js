import { execSync } from 'child_process';
import os from 'os';

/**
 * Check if a command exists in PATH
 */
export const commandExists = (cmd) => {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
};

/**
 * Execute a command and return stdout
 */
export const execCommand = (cmd, options = {}) => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...options }).trim();
  } catch (error) {
    if (options.throwOnError !== false) {
      throw error;
    }
    return null;
  }
};

/**
 * Detect the available package manager
 * Returns: { name, install: (pkg) => cmd, setup?: { [tool]: () => cmds[] } }
 */
export const detectPackageManager = () => {
  const platform = process.platform;

  if (platform === 'darwin') {
    if (commandExists('brew')) {
      return {
        name: 'Homebrew',
        install: (pkg) => `brew install ${pkg}`,
      };
    }
    return null;
  }

  if (platform === 'linux') {
    if (commandExists('apt-get')) {
      return {
        name: 'apt',
        install: (pkg) => `sudo apt-get install -y ${pkg}`,
        setup: {
          gh: [
            'curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg',
            'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null',
            'sudo apt-get update',
          ],
          sqlcmd: [
            'curl https://packages.microsoft.com/keys/microsoft.asc | sudo tee /etc/apt/trusted.gpg.d/microsoft.asc',
            'curl https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/prod.list | sudo tee /etc/apt/sources.list.d/mssql-release.list',
            'sudo apt-get update',
          ],
        },
        packages: {
          sqlcmd: 'mssql-tools18',
        },
      };
    }

    if (commandExists('dnf')) {
      return {
        name: 'dnf',
        install: (pkg) => `sudo dnf install -y ${pkg}`,
        setup: {
          gh: [
            'sudo dnf install -y dnf-plugins-core',
            'sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo',
          ],
          sqlcmd: [
            'curl https://packages.microsoft.com/config/rhel/9/prod.repo | sudo tee /etc/yum.repos.d/mssql-release.repo',
          ],
        },
        packages: {
          sqlcmd: 'mssql-tools18',
        },
      };
    }

    if (commandExists('pacman')) {
      return {
        name: 'pacman',
        install: (pkg) => `sudo pacman -S --noconfirm ${pkg}`,
        packages: {
          sqlcmd: 'mssql-tools', // AUR
        },
      };
    }

    // Homebrew on Linux
    if (commandExists('brew')) {
      return {
        name: 'Homebrew (Linux)',
        install: (pkg) => `brew install ${pkg}`,
      };
    }
  }

  return null;
};

/**
 * Get platform info
 */
export const getPlatformInfo = () => {
  return {
    platform: process.platform,
    arch: process.arch,
    homeDir: os.homedir(),
    isWindows: process.platform === 'win32',
    isMac: process.platform === 'darwin',
    isLinux: process.platform === 'linux',
  };
};

/**
 * Run setup commands for a tool
 */
export const runSetupCommands = (commands) => {
  for (const cmd of commands) {
    execSync(cmd, { stdio: 'inherit', shell: true });
  }
};

/**
 * Install a package using the detected package manager
 */
export const installPackage = async (pkg, pkgManager, tool = null) => {
  // Run setup commands if needed
  if (tool && pkgManager.setup?.[tool]) {
    console.log('  Setting up package repository...');
    runSetupCommands(pkgManager.setup[tool]);
  }

  // Get correct package name (may differ per platform)
  const packageName = pkgManager.packages?.[pkg] || pkg;

  // Install
  const installCmd = pkgManager.install(packageName);
  console.log(`  Running: ${installCmd}`);
  execSync(installCmd, { stdio: 'inherit', shell: true });
};
