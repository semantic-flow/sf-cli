// sf-cli.js

import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts";
import { Input, Confirm } from "https://deno.land/x/cliffy@v1.0.0-rc.4/prompt/mod.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { green, bold } from "https://deno.land/std@0.224.0/fmt/colors.ts";
import { existsSync } from "https://deno.land/std@0.224.0/fs/exists.ts";

const DEFAULT_SITEROOT = "http://localhost/";

// Update the action handler to use the Git config username
await new Command()
  .name("sf-cli")
  .version("0.1.0")
  .description("CLI tool for Semantic Flow Root Repositories")
  .command("init")
  .option("-d, --debug", "Enable debug output.")
  .arguments("[path:string]")
  .option("--siteRoot <siteRoot:string>", "Specify the site root URL.")
  .description("Initialize a new SFRootRepo at the given path.")
  .action(async (options, path, siteRoot) => {
    if (options.debug) {
      console.log('Debug: Passed-in Path value:', path);
      console.log('Debug: Passed-in siteRoot value:', siteRoot);
      console.log('Debug: Options received:', options);
    }
    
    path = path || Deno.cwd(); 
    console.log(`Initializing SFRootRepo at: ${path}`);

    const rootRepoName = path.split('/').filter(Boolean).pop();

    if (options.debug) {
      console.log('Debug: final path:', path);
      console.log('Debug: rootRepoName:', rootRepoName);
    }

    if (!rootRepoName) {
      console.log("Error: Invalid path provided.");
      Deno.exit(1);
    }

    // Infer site root if not provided
    if (!siteRoot) {
      if (existsSync(`${path}/.git`)) {
        try {
          const gitConfigPath = `${path}/.git/config`;
          const gitConfig = await Deno.readTextFile(gitConfigPath);
          const urlMatch = gitConfig.match(/url = (.+)/);
          if (urlMatch) {
            const gitUrl = urlMatch[1].trim();
            if (gitUrl.startsWith("git@github.com:")) {
              const repoPath = gitUrl.split("git@github.com:")[1].replace(".git", "");
              const [user, repo] = repoPath.split("/");
              if (repo === `${user}.github.io`) {
                siteRoot = `https://${user}.github.io`;
              } else {
                siteRoot = `https://${user}.github.io/${repo}`;
              }
            } else if (gitUrl.startsWith("https://github.com/")) {
              const repoPath = gitUrl.split("https://github.com/")[1].replace(".git", "");
              const [user, repo] = repoPath.split("/");
              if (repo === `${user}.github.io`) {
                siteRoot = `https://${user}.github.io`;
              } else {
                siteRoot = `https://${user}.github.io/${repo}`;
              }
            } else {
              console.log("Warning: Unrecognized git URL format. Cannot infer site root.");
            }
          } else {
            console.log("Warning: Could not find repository URL in .git/config.");
          }
        } catch (error) {
          console.log("Warning: Failed to read .git/config for site root inference.", error);
        }
      } else {
        console.log("Warning: Site root not provided and could not be inferred.");
      }

      siteRoot = siteRoot || DEFAULT_SITEROOT;
    }

    if (!options.siteRoot) {
      siteRoot = await Input.prompt({ message: "Enter the site root URL:", default: siteRoot });
    } else {
      siteRoot = options.siteRoot;
    }
      if (options.debug) { {
      console.log('Debug: final siteRoot:', siteRoot);
      console.log('Debug: rootRepoName:', rootRepoName);
    }

    await ensureDir(path);
    const docsDir = `${path}/docs`;
    await ensureDir(docsDir);
    await ensureDir(`${docsDir}/_assets`);
    const srcDir = `${path}/src`;
    await ensureDir(srcDir);
    const templateDir = `${path}/templates`;
    await ensureDir(templateDir);
    
    const configPath = `${path}/config.jsonld`;
    let writeConfig = false;

    if (existsSync(configPath)) {
      const overwriteResponse = await Confirm.prompt({ message: "Configuration file already exists. Do you want to overwrite it?", default: false });
      writeConfig = overwriteResponse;
    } else {
      writeConfig = true;
    }

    if (writeConfig) {
      const siteDescription = await Input.prompt({ message: "Enter a description for the Semantic Flow site:", default: "A Semantic Flow site." });
      
      // Use the function to get the GitHub username from local git config
      let creator = await getGitConfig("user.name");
      creator = creator || getGitConfig("user.email");

      if (!creator && siteRoot && siteRoot.includes("github.io")) {
        const userMatch = siteRoot.match(/https:\/\/([^\.]+)\.github\.io/);
        if (userMatch) {
          creator = userMatch[1];
        }
      }

      creator = await Input.prompt({ message: "Enter the creator name (default inferred from Git repository username/orgname):", default: creator });
      const responses = { siteDescription, creator };

      const config = {
        "@context": {
          "sflo": "http://semantic-flow.github.io/ontology/",
          "dc": "http://purl.org/dc/elements/1.1/",
          "@base": siteRoot
        },
        "@id": "",
        "@type": "sflo:SemanticFlowSite",
        "sflo:siteDescription": responses.siteDescription,
        "dc:creator": responses.creator,
        "sflo:hasSourceFolder": "src",
        "sflo:hasOutputFolder": "docs"
      };

      await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
      console.log(green(`Configuration file created at: ${bold(configPath)}`));
    } else {
      console.log(green(`Configuration file was not written.`));
    }

    console.log(green(`SFRootRepo initialized successfully at ${bold(path)}`));
    if (siteRoot !== DEFAULT_SITEROOT) {
      console.log(green(`Site Root: ${bold(siteRoot)}`));
    }
  })
  .parse(Deno.args);


// Define the function to get the GitHub username from git config
async function getGitConfig(key) {
  try {
    const process = Deno.run({
      cmd: ["git", "config", "--get", key],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await process.output(); // Get the output from stdout
    const decoder = new TextDecoder();
    const username = decoder.decode(output).trim();
    
    if (username) {
      return username;
    }
  } catch (error) {
    console.error("Warning: Could not retrieve Git user name from local config.", error);
  }
  return "unknown"; // Return "unknown" if there's an error or no username is set
}
