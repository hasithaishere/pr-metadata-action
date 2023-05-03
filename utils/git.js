const path = require('path')
const { readFile } = require('fs-extra');
const capitalize = require('lodash.capitalize');
const Crypto = require('./crypto');

const COMMIT_MESSAGE_PREFIX = 'Auto generated - New Release';

class Git {
    async uploadToRepo(octokit, filesPaths, org, repo, branch, version) {
        // gets commit's AND its tree's SHA
        const currentCommit = await this._getCurrentCommit(octokit, org, repo, branch)
        //const filesPaths = await glob(coursePath)
        const filesBlobs = await Promise.all(filesPaths.map(this._createBlobForFile(octokit, org, repo)))
        const pathsForBlobs = filesPaths.map(fullPath => path.relative('./', fullPath))
        const newTree = await this._createNewTree(
            octokit,
            org,
            repo,
            filesBlobs,
            pathsForBlobs,
            currentCommit.treeSha
        )
        const newCommit = await this._createNewCommit(
            octokit,
            org,
            repo,
            `${COMMIT_MESSAGE_PREFIX} (${version})`,
            newTree.sha,
            currentCommit.commitSha
        );

        await this._setBranchToCommit(octokit, org, repo, branch, newCommit.sha);

        return newCommit.sha;
    }

    async _getCurrentCommit(octokit, org, repo, branch) {
        const { data: refData } = await octokit.rest.git.getRef({
            owner: org,
            repo,
            ref: `heads/${branch}`,
        });

        const commitSha = refData.object.sha
        const { data: commitData } = await octokit.rest.git.getCommit({
            owner: org,
            repo,
            commit_sha: commitSha,
        });

        return {
            commitSha,
            treeSha: commitData.tree.sha,
        };
    }

    // Notice that readFile's utf8 is typed differently from Github's utf-8
    _getFileAsUTF8(filePath) {
        return readFile(filePath, 'utf8');
    }

    _createBlobForFile(octokit, org, repo) {
        return async (filePath) => {
            const content = await this._getFileAsUTF8(filePath)
            const blobData = await octokit.rest.git.createBlob({
                owner: org,
                repo,
                content,
                encoding: 'utf-8',
            })
            return blobData.data
        };
    }

    async _createNewCommit(octokit, org, repo, message, currentTreeSha, currentCommitSha) {
        const { data } = await octokit.rest.git.createCommit({
            owner: org,
            repo,
            message,
            tree: currentTreeSha,
            parents: [currentCommitSha],
        })
        return data;
    }

    _setBranchToCommit(octokit, org, repo, branch, commitSha) {
        return octokit.rest.git.updateRef({
            owner: org,
            repo,
            ref: `heads/${branch}`,
            sha: commitSha,
        })
    }

    filterCommits(commits) {
        const features = [];
        const bug_fixes = [];
        const other_commits = [];

        commits.reverse().forEach((commitData) => {
            let { message } = commitData.commit;

            if (!message.startsWith('Merge pull request') && !message.startsWith('Merge branch') && !message.startsWith('Auto generated')) {
                const splits = message.split(':');

                const commit = {
                    commit_name: message,
                    commit_hash: commitData.sha,
                    compact_commit_hash: commitData.sha.substring(0, 7),
                };

                if (splits.length > 1) {
                    const type = splits[0].trim().toLowerCase();
                    splits.shift();
                    commit.commit_name = capitalize(splits.join(' ').trim());
                    switch (type) {
                        case 'feat':
                            features.push(commit);
                            break;
                        case 'fix':
                            bug_fixes.push(commit);
                            break;
                        default:
                            other_commits.push(commit);
                            break;
                    }
                } else {
                    other_commits.push(commit);
                }
            }

        });

        return { features, bug_fixes, other_commits };
    };

    filterFiles(files) {
        const fileSetHashMap = new Set();
        const fileList = [];

        files.forEach((file) => {
            const { filename } = file;
            let entity = filename;
            let type = 'Other';
            let subProjectRoot = null;

            if (filename.startsWith('service/lambda/')) {
                const lambdaName = filename.split('/')[2];
                entity = capitalize(lambdaName);
                type = 'Lambda';
                subProjectRoot = `service/lambda/${lambdaName}`;
                //fileList.push({ entity: capitalize(filename.split('/')[2]), type: 'Lambda' });
            } else if (filename.startsWith('service/')) {
                const serviceName = filename.split('/')[1];
                entity = capitalize(serviceName);
                type = 'ECS';
                subProjectRoot = `service/${serviceName}`;
                //fileList.push({ entity: capitalize(filename.split('/')[1]), type: 'ECS' });
            } else if (filename.startsWith('infra/')) {
                entity = filename;
                type = 'Infrastructure';
                //fileList.push({ entity: filename, type: 'Infrastructure' });
            }
            const entityHash = Crypto.generateHash(`${entity}-${type}`);
            if (!fileSetHashMap.has(entityHash)) {
                fileSetHashMap.add(entityHash);
                fileList.push({ entity, type, subProjectRoot });
            }
        });

        return fileList.sort();
    };

    async getFoldersInGivenPath(octokit, owner, repo, basePath) {
        let response = [];

        try {
            response = await octokit.rest.repos.getContent({
                owner,
                repo,
                path: basePath,
            });
        } catch (error) { }

        // Filter the response to only include folder objects
        return response.data.filter((item) => item.type === "dir");
    };

}

module.exports = Git;