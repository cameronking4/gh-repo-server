# Fetch Github Repo for ChatGPT context

## Deno Deploy Server

This Deno server application uses the Oak framework to create a simple API for fetching and displaying the contents of a GitHub repository. The API exposes an endpoint to retrieve the contents of a specified repository, including files and directories, but excludes certain file types (e.g., images and videos).

## Features

- Fetch contents of a specified GitHub repository.
- Recursively retrieve and display directory contents.
- Exclude certain file types from retrieval.
- Return file contents in JSON format.

## Prerequisites

- Deno runtime installed. [Install Deno](https://deno.land/manual@v1.11.5/getting_started/installation)
- A GitHub Personal Access Token (PAT) with access to the desired repositories.

## Environment Variables

- `GITHUB_PAT`: Your GitHub Personal Access Token.

## Installation

1. **Clone the repository:**

   ```sh
   git clone <repository-url>
   cd <repository-directory>