const core = require('@actions/core');
const github = require('@actions/github');
const yaml = require('js-yaml');

async function main() {
    try {
        const githubToken = core.getInput('github-token');
        const configFile = core.getInput('configuration-file');

        const client = github.getOctokit(githubToken);
        const config = await getConfig(client, configFile);

        const app = new App(client, config);
        await app.run();
    } catch (error) {
        core.setFailed(error.message);
    }
}

async function getConfig(client, configFile) {
    if (!configFile) {
        throw new Error(`No configuration file specified`);
    }

    let configData;
    try {
        ({
            data: { content: configData }
        } = await client.rest.repos.getContent({
            ...github.context.repo,
            path: configFile
        }));
    } catch (err) {
        if (err.status === 404) {
            throw new Error(`Missing configuration file (${configFile})`);
        } else {
            throw err;
        }
    }

    if (!configData) {
        throw new Error(`Empty configuration file (${configFile})`);
    }

    const config = yaml.load(Buffer.from(configData, 'base64').toString());
    if (!config) {
        throw new Error(`Invalid configuration file (${configFile})`);
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

        if (payload.sender.type === 'Bot') {
            return;
        }

        let issueNumber = payload.issue?.number;
        if (!issueNumber) {
            return;
        }

        if (payload.action === 'labeled') {
            await this.assignUsers(issueNumber, this.config[payload.label.name]);
        } else if (payload.action === 'unlabeled') {
            await this.unassignUsers(issueNumber, this.config[payload.label.name]);
        }
    }

    async assignUsers(issueNumber, users) {
        if (!users) {
            return;
        }

        await this.client.rest.issues.addAssignees({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            issue_number: issueNumber,
            assignees: users
        });
    }

    async unassignUsers(issueNumber, users) {
        if (!users) {
            return;
        }

        await this.client.rest.issues.removeAssignees({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            issue_number: issueNumber,
            assignees: users
        });
    }
}

main();
