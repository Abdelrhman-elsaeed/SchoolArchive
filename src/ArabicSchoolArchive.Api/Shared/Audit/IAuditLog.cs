namespace ArabicSchoolArchive.Api.Shared.Audit;

public interface IAuditLog
{
    void Record(AuditEvent evt);
}
