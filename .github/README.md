# GitHub Actions Sync Workflow

This repository contains a GitHub Actions workflow designed to synchronize commits from the original repository to the forked repository. 

## Workflow Overview

The workflow is triggered on push events to the main branch of the original repository. It fetches the latest changes from the upstream repository and pushes them to the forked repository, ensuring that your fork remains up-to-date with the original project.

## Setup Instructions

1. **Fork the Original Repository**: Start by forking the original repository you want to sync with.

2. **Configure Upstream Remote**: Ensure that your forked repository has the original repository set as an upstream remote. You can do this by running:
   ```
   git remote add upstream <original-repo-url>
   ```

3. **Create the Workflow**: The workflow file is located at `.github/workflows/sync-fork.yml`. This file contains the necessary steps to automate the syncing process.

4. **Push Changes**: Once the workflow is set up, any push to the main branch will trigger the workflow to sync changes from the original repository.

## Notes

- Make sure to check the permissions of the GitHub Actions in your repository settings to allow the workflow to push changes.
- You can customize the workflow file to suit your specific needs, such as changing the branch names or adding additional steps.

This README serves as a guide to help you understand and utilize the GitHub Actions workflow for syncing your forked repository.