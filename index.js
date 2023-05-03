const core = require('@actions/core');
const github = require('@actions/github');
const { uploadToRepo, filterCommits, filterFiles } = require('./utils/commits');
const Version = require('./utils/version');
const ChangeLog = require('./utils/changelog');
const PackageFile = require('./utils/packageFile');
const { promises: fs } = require('fs');

const main = async () => {
    try {
        /**
         * We need to fetch all the inputs that were provided to our action
         * and store them in variables for us to use.
         **/
        const owner = core.getInput('owner', { required: true });
        const repo = core.getInput('repo', { required: true });
        const pr_number = core.getInput('pr_number', { required: true });
        const token = core.getInput('token', { required: true });

        /**
         * Now we need to create an instance of Octokit which will use to call
         * GitHub's REST API endpoints.
         * We will pass the token as an argument to the constructor. This token
         * will be used to authenticate our requests.
         * You can find all the information about how to use Octokit here:
         * https://octokit.github.io/rest.js/v18
         **/
        const octokit = new github.getOctokit(token);

        /**
         * We need to fetch the list of files that were changes in the Pull Request
         * and store them in a variable.
         * We use octokit.paginate() to automatically loop over all the pages of the
         * results.
         * Reference: https://octokit.github.io/rest.js/v18#pulls-list-files
         */

        //const changedFiles = [];

        // const { data: changedFiles } = await octokit.rest.pulls.listFiles({
        //     owner,
        //     repo,
        //     pull_number: pr_number,
        // });


        /**
         * Contains the sum of all the additions, deletions, and changes
         * in all the files in the Pull Request.
         **/
        // let diffData = {
        //     additions: 0,
        //     deletions: 0,
        //     changes: 0
        // };

        // Reference for how to use Array.reduce():
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/Reduce
        // diffData = changedFiles.reduce((acc, file) => {
        //     acc.additions += file.additions;
        //     acc.deletions += file.deletions;
        //     acc.changes += file.changes;
        //     return acc;
        // }, diffData);

        /**
         * Loop over all the files changed in the PR and add labels according 
         * to files types.
         **/
        // for (const file of changedFiles) {
        //     /**
        //      * Add labels according to file types.
        //      */
        //     const fileExtension = file.filename.split('.').pop();
        //     switch (fileExtension) {
        //         case 'md':
        //             await octokit.rest.issues.addLabels({
        //                 owner,
        //                 repo,
        //                 issue_number: pr_number,
        //                 labels: ['markdown'],
        //             });
        //         case 'js':
        //             await octokit.rest.issues.addLabels({
        //                 owner,
        //                 repo,
        //                 issue_number: pr_number,
        //                 labels: ['javascript'],
        //             });
        //         case 'yml':
        //             await octokit.rest.issues.addLabels({
        //                 owner,
        //                 repo,
        //                 issue_number: pr_number,
        //                 labels: ['yaml'],
        //             });
        //         case 'yaml':
        //             await octokit.rest.issues.addLabels({
        //                 owner,
        //                 repo,
        //                 issue_number: pr_number,
        //                 labels: ['yaml'],
        //             });
        //     }
        // }

        // const releasesList = await octokit.rest.repos.listReleases({
        //     owner,
        //     repo
        // });

        // Files need to commit after version update
        const updatedFiles = [];

        const tagsList = await octokit.rest.repos.listTags({
            owner,
            repo,
        });

        const baseHash = tagsList.data[0].commit.sha;
        
        const compare = await octokit.rest.repos.compareCommits({
            owner,
            repo,
            base: baseHash,
            head: 'main'
        });

        // console.log('commits...>>', JSON.stringify(filterCommits(compare.data.commits)));
        // console.log('files...>>', JSON.stringify(filterFiles(compare.data.files)));
        // console.log('owner...>>', JSON.stringify(owner));
        // console.log('repo...>>', JSON.stringify(repo));

        const commitsDiff = filterCommits(compare.data.commits);
        const changedFilesList = filterFiles(compare.data.files);




        


        /**
         * Create a comment on the PR with the information we compiled from the
         * list of changed files.
         */
    //     await octokit.rest.issues.createComment({
    //         owner,
    //         repo,
    //         issue_number: pr_number,
    //         body: `
    //     Pull Request #${pr_number} has been updated with: \n
    //     - ${diffData.changes} changes \n
    //     - ${diffData.additions} additions \n
    //     - ${diffData.deletions} deletions \n
    //     -- releasesList -- ${JSON.stringify(releasesList.data)} \n
    //     -- tagsList -- ${JSON.stringify(tagsList.data)} \n
    //     -- compare -- ${JSON.stringify(compare.data)} \n
    //     -- cotext -- ${JSON.stringify(github.context)} \n
    //   `
    //     });

        const { eventName } = github.context;

        //console.log('github.context >> ', JSON.stringify(github.context));

        //await fs.writeFile('github-context.json', JSON.stringify(github.context));
        //const filesPaths = ['github-context.json'];

        // try {
            
        //     console.log('New Version >>', newVersion);
        // } catch (error) {
        //     console.log('error >> ', error);
        // }

        const newVersion = await Version.getNewVersion(octokit, owner, repo, github);

        console.log('New Version >>', newVersion);

        const changelogDataSet = {
            version: newVersion,
            previous_version: "3.1.0",
            org: owner,
            repo,
            date: "2023-04-18",
            ...commitsDiff,
            affected_areas: changedFilesList 
        };

        //console.log(">>", changelogDataSet)

        const changeLogContent = await ChangeLog.generateChangeLogContent(octokit, owner, repo, changelogDataSet);
        const changeLogPath = await ChangeLog.updateChangeLog(changeLogContent);
        updatedFiles.push(changeLogPath);
        console.log('changeLog >> ', changeLogContent);

        const rootPackageFileContent = await PackageFile.generatePackageFileContent(octokit, owner, repo, 'package.json', newVersion);
        const rootPackageFilePath = await PackageFile.updatePackageFile(rootPackageFileContent);
        updatedFiles.push(rootPackageFilePath);
        console.log('rootPackageFile >> ', rootPackageFileContent);

        // if ( eventName === 'push') {
        //     console.log('safe to exit');
        //     process.exit(0);
        // } else {
        //     console.log('not safe to exit');
        //     process.exit(1);
        // }

        // Filed for testing purposes :D
        process.exit(1);

    } catch (error) {
        core.setFailed(error.message);
    }
}

// Call the main function to run the action
main();