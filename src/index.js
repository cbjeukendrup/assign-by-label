const core = require('@actions/core');
const github = require('@actions/github');
const yaml = require('js-yaml');

async function main() {
    try {
        const githubToken = core.getInput('github-token');
        const configurationPath = core.getInput('configuration-path');

        const client = github.getOctokit(githubToken);
        const config = await getConfig(client, configurationPath);

        const app = new App(client, config);
        await app.run();
    } catch (error) {
        core.setFailed(error.message);
    }
}

async function getConfig(client, configurationPath) {
    if (!configurationPath) {
        throw new Error(`No configuration file specified`);
    }

    let configData;
    try {
        ({
            data: { content: configData }
        } = await client.rest.repos.getContent({
            ...github.context.repo,
            path: configurationPath
        }));
    } catch (err) {
        if (err.status === 404) {
            throw new Error(`Missing configuration file (${configurationPath})`);
        } else {
            throw err;
        }
    }

    if (!configData) {
        throw new Error(`Empty configuration file (${configurationPath})`);
    }

    const config = yaml.load(Buffer.from(configData, 'base64').toString());
    if (!config) {
        throw new Error(`Invalid configuration file (${configurationPath})`);
    }

    return config;
}

class App {
    constructor(client, config) {
        this.client = client;
        this.config = config;
    }

    async run() {
        const payload = github.context.payload;

        let issueNumber = payload.issue?.number;
        if (!issueNumber) {
            return;
        }

        if (payload.action === 'labeled') {
            await this.assignUsers(issueNumber, payload.label.name, this.config[payload.label.name]);
        } else if (payload.action === 'unlabeled') {
            await this.unassignUsers(issueNumber, payload.label.name, this.config[payload.label.name]);
        }
    }

    async assignUsers(issueNumber, label, users) {
        if (!users) {
            core.info(`No one to be assigned for label ${label}`);
            return;
        }

        core.info(`Assigning ${users.join(', ')} for label ${label}`);

        await this.client.rest.issues.addAssignees({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            issue_number: issueNumber,
            assignees: users
        });
    }

    async unassignUsers(issueNumber, label, users) {
        if (!users) {
            core.info(`No one to be unassigned for label ${label}`);
            return;
        }

        core.info(`Unassigning ${users.join(', ')} for label ${label}`);

        await this.client.rest.issues.removeAssignees({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            issue_number: issueNumber,
            assignees: users
        });
    }
}

main();
