# Production Studio scope

The Studio now has a real order operations panel as the first operational UI milestone. It calls the consolidated `/api/admin/orders` PATCH endpoint for status, payment, sourcing, supplier and cost changes. The next Studio modules must use the same pattern: server-authorized mutation, audit/event record, loading/error feedback, and refresh after mutation.
