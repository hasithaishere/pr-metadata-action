const get = require('lodash.get');

class Version {
    static async getVersions(octokit, owner, repo, github, isMajorRelease = false, tagPrefix = 'v', tagSuffix = '') {
        const tags = await octokit.rest.repos.listTags({
            owner,
            repo,
        });

        const latestTag = get(tags, 'data[0].name');

        const branch = github.context.payload.pull_request.head.ref;
        const branchPrefix = branch.split('/')[0];

        let [major = 0, minor = 0, patch = 0] = latestTag.replace(/[^0-9\.]/g, '').split('.');

        major = parseInt(major);
        minor = parseInt(minor);
        patch = parseInt(patch);

        let newTag = `${major}.${minor}.${patch}`;

        if (isMajorRelease) {
            newTag = `${major + 1}.0.0`;
        } else {
            if (branchPrefix === 'flight') {
                newTag = `${major}.${minor + 1}.0`;
            } else if (branchPrefix === 'hotfix') {
                newTag = `${major}.${minor}.${patch + 1}`;
            }
        }

        return {
            newVersion: `${tagPrefix}${newTag}${tagSuffix}`,
            currentVersion: latestTag,
        };
    }
}

module.exports = Version;