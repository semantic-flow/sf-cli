// sf-cli.js

import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts";
import { Input, Confirm } from "https://deno.land/x/cliffy@v1.0.0-rc.4/prompt/mod.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { green, bold } from "https://deno.land/std@0.224.0/fmt/colors.ts";
import { existsSync } from "https://deno.land/std@0.224.0/fs/exists.ts";

const DEFAULT_SITEROOT = "http://localhost/";
const DEFAULT_OUTPUT_DIRNAME = "docs";
const DEFAULT_SRC_DIRNAME = "src";

// Update the action handler to use the Git config username
await new Command()
  .name("sf-cli")
  .version("0.1.0")
  .description("CLI tool for Semantic Flow Root Repositories")
  .command("init")
  .option("-d, --debug", "Enable debug output.")
  .arguments("[path:string]")
  .option("--siteRoot <siteRoot:string>", "Specify the site root URL.")
  .option("-o, --output <output:string>", "Specify the output directory where the site files will be generated.")
  .option("--src <src:string>", "Specify the source directory where the SFDataRepos and other RDF data will live.")
  .description("Initialize a new SFRootRepo at the given path.")
  .action(async (options, path, siteRoot) => {
    if (options.debug) {
      console.log('Debug: Passed-in Path value:', path);
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
    if (!options.siteRoot) {
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

      siteRoot = siteRoot || DEFAULT_SITEROOT + rootRepoName;
      siteRoot = await Input.prompt({ message: "Enter the site root URL:", default: siteRoot });

      } else {
        siteRoot = options.siteRoot;
      }
      
      if (options.debug) { 
      console.log('Debug: final siteRoot:', siteRoot);
      console.log('Debug: rootRepoName:', rootRepoName);
    }

    await ensureDir(path);
    const configPath = `${path}/config.jsonld`;
    let outputDir = options.output || DEFAULT_OUTPUT_DIRNAME;
    if (!existsSync(configPath)) {
      outputDir = await Input.prompt({ message: "Enter the output directory:", default: outputDir });
    }
    const outputPath = `${path}/${outputDir}`;
        await ensureDir(outputPath);
        await ensureDir(`${outputPath}/_assets`);
        let srcDir = options.src || DEFAULT_SRC_DIRNAME;
    if (!existsSync(configPath)) {
      srcDir = await Input.prompt({ message: "Enter the source directory:", default: srcDir });
    }
    const srcPath = `${path}/${srcDir}`;
    await ensureDir(srcPath);

    const templateDir = `${path}/templates`;
    await ensureDir(templateDir);
    
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
      let creator = await getGitConfig(options,"user.name");
      creator = creator || getGitConfig(options,"user.email");

      if (!creator && siteRoot && siteRoot.includes("github.io")) {
        const userMatch = siteRoot.match(/https:\/\/([^\.]+)\.github\.io/);
        if (userMatch) {
          creator = userMatch[1];
        }
      }

      creator = await Input.prompt({ message: "Enter the creator name (default inferred from Git repository user.name or else user.email):", default: creator });
      const responses = { siteDescription, creator };

      const config = {
        "@context": {
          "@base": siteRoot,
          "sflo": "http://semantic-flow.github.io/ontology/",
          "dc": "http://purl.org/dc/elements/1.1/",
        },
        "@id": "",
        "@type": "sflo:SemanticFlowSite",
        "sflo:siteDescription": responses.siteDescription,
        "dc:creator": responses.creator,
        "sflo:hasSourceFolder": srcDir,
        "sflo:hasOutputFolder": outputDir
      };

      await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
      console.log(green(`Configuration file created at: ${bold(configPath)}`));
    } else {
      console.log(green(`Configuration file was not written.`));
    }

    console.log(green(`SFRootRepo initialized successfully at ${bold(path)}`));
  })
  .parse(Deno.args);


// Define the function to get the GitHub config values from git config
async function getGitConfig(options,key) {
  try {
    const command = new Deno.Command("git", {
        args: ["config", "--get", key]
    });
    const {success, stdout} = await command.output(); // Get the output from stdout
    const decoder = new TextDecoder();
    const result = decoder.decode(stdout).trim();
    if (options.debug) {
      success ? console.log(`Debug: Git ${key} retrieved: ${result}`) : console.log(`Debug: Git ${key} NOT retrieved`)
    }

    if (result) {
      return result;
    }
  } catch (error) {
    console.error(`Warning: Could not retrieve Git {$key} from local config.`, error);
  }
  return false; // Return false if there's an error or no corresponding key is found
}
