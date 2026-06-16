# DATA_FLOW.md - System Data Flow & Lifecycle

This document describes the workflow sequence, pipeline steps, and operational boundaries of the file uploading and storage execution path in the **الأرشيف المدرسي العربي** (Arabic School Archive) system.

---

## 1. Sequence Flow Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Client as User Browser (React)
    participant API as Backend (ASP.NET Core)
    participant N8N as n8n Classification Service
    participant Storage as Azure Blob Storage
    participant DB as Azure SQL Database

    Client->>API: Send upload request (Multipart Form)
    Note over API: Authenticate User<br/>Validate School Access<br/>Perform File Validation (Type, Size, MIME)

    loop For each file in the payload sequentially
        API->>N8N: Call Webhook (multipart/form-data with file)
        
        alt n8n returns 200 OK with classification payload
            N8N-->>API: Return Classification JSON (e.g. tag, category)
            
            API->>Storage: Upload original file to private folder path
            alt Storage upload succeeds (201 Created)
                Storage-->>API: Confirm Blob URI
                
                API->>DB: Save metadata row to SQL table
                DB-->>API: Confirm DB row saved
                Note over API: Set File Status = Success
            else Storage upload fails (Error)
                Note over API: Abort SQL Write<br/>Set File Status = Failure<br/>Reason: Storage upload failed
            end
            
        else n8n returns 500 or times out
            Note over API: Abort Storage Upload<br/>Abort SQL Write<br/>Set File Status = Failure<br/>Reason: Classification failed
        end
    end

    API-->>Client: Return combined array of per-file results
```

---

## 2. Text Flow Sequence (Step-by-Step)

For each file in the upload payload, the application follows this exact sequence:

1. **Validate**: Perform local file validations (extension checks, size checks, and magic bytes MIME verification).
2. **Call n8n**: Call the n8n classification webhook passing the file payload.
3. **Blob Storage Upload**: If the n8n call succeeds, upload the original file to private Azure Blob Storage.
4. **Save DB Row**: If the Blob Storage upload succeeds, save the file's metadata row to the Azure SQL Database.
5. **Fail-Fast Boundary**: If any step in this sequence fails (validation fails, n8n fails/times out, or Blob Storage fails), the process is aborted immediately, and the system **does not save a DB row**. 

**DB write is always last.** Under no circumstances will a database record be generated prior to completing all validation, classification, and physical file storage steps.

---

## 3. Request vs. Response Behaviors

- **Single-File Upload**:
  - Behaves as a single iteration of the sequential loop.
  - Returns a standard success or failure response corresponding to the file's final status.
- **Multi-File Upload**:
  - The client uploads multiple files in a single array.
  - The backend handles isolation between files; if File 1 fails n8n classification but File 2 succeeds, the backend completes the lifecycle for File 2 and saves it, while returning a detailed error message for File 1.
  - Returns a unified array response mapping each file's original name to its operational status.
