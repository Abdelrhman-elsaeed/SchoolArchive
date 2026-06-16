# LOCAL_RUN.md - Local Development Setup Guide

This document describes the environment and configuration setup required to run the **الأرشيف المدرسي العربي** (Arabic School Archive) application locally. 

> [!IMPORTANT]
> **No commands, execution scripts, or migration templates are defined in this document because the workspace repository is currently empty.** 
> All run instructions, package installations, docker setups, and DB migrations are represented as `[TODO]` placeholders. They will be completed in later implementation phases once code templates are introduced.

---

## 1. Prerequisites (Logical Stack)
- **Backend SDK**: .NET 10 SDK `[TODO]`
- **Frontend Runtime**: Node.js `[TODO]`
- **Database**: Azure SQL Emulator / Local SQL Server `[TODO]`
- **Storage Emulator**: Azurite `[TODO]`
- **Workflow Automation**: n8n local instance `[TODO]`

---

## 2. Environment Configurations

`[TODO: Once configuration files exist in the repository, environment details will be mapped here.]`

---

## 3. Local Execution Procedures

### Database Setup
- **Migrations**: `[TODO: Database schema migrations execution commands]`
- **Local Seed Data**: `[TODO: Initial mock data seed commands]`

### Storage Emulator Execution (Azurite)
- **Command**: `[TODO: Local Azurite emulator launch syntax]`

### n8n Local Setup
- **Endpoint Mocking**: `[TODO: Webhook listener execution syntax]`

### Backend Execution (ASP.NET Core Web API)
- **Build / Run Command**: `[TODO: Backend execution CLI syntax]`

### Frontend Execution (React + Vite)
- **Dependency Install Command**: `[TODO: Frontend package install command]`
- **Development Server Run Command**: `[TODO: Frontend execution CLI syntax]`
