# MongoDB Connection Troubleshooting Guide

## Current Issue
Your application is experiencing a "Server selection timeout: No available servers" error when trying to connect to Railway MongoDB.

## Error Analysis
```
Server selection timeout: No available servers. Topology: { Type: Unknown, Servers: [ { Address: nozomi.proxy.rlwy.net:23351, Type: Unknown, Error: Kind: I/O error: timed out, labels: {} } ] }
```

## Immediate Solutions

### 1. Check Environment Variables
Create a `.env` file in your project root with the correct configuration:

```bash
# For LOCAL development
DATABASE_URL="mongodb://localhost:27017/mistica_autentica"
NODE_ENV="development"

# For RAILWAY deployment (uncomment and configure)
# DATABASE_URL="mongodb://username:password@nozomi.proxy.rlwy.net:23351/mistica_autentica?retryWrites=true&w=majority&authSource=admin"
# NODE_ENV="production"
```

### 2. Test Local MongoDB
If testing locally, ensure MongoDB is running:

```bash
# Using Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Or install MongoDB locally
# Windows: Download from mongodb.com
# macOS: brew install mongodb-community
# Linux: sudo apt install mongodb
```

### 3. Verify Railway MongoDB Status
1. Go to your Railway dashboard
2. Check if MongoDB service is running
3. Verify connection string format
4. Check if there are any network restrictions

## Connection String Format

### Basic Format
```
mongodb://username:password@host:port/database_name
```

### With Options (Recommended for Railway)
```
mongodb://username:password@nozomi.proxy.rlwy.net:23351/mistica_autentica?retryWrites=true&w=majority&authSource=admin&connectTimeoutMS=30000&socketTimeoutMS=30000
```

### Connection Options Explained
- `retryWrites=true`: Automatically retry write operations
- `w=majority`: Wait for majority of replica set members
- `authSource=admin`: Authentication database
- `connectTimeoutMS=30000`: Connection timeout (30 seconds)
- `socketTimeoutMS=30000`: Socket timeout (30 seconds)

## Testing Steps

### 1. Test Health Endpoint
After starting your application, test the health endpoint:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-08-25T10:49:34.000Z",
  "database": "connected",
  "environment": "development"
}
```

### 2. Test Database Connection
```bash
# Test with MongoDB shell (if available)
mongosh "mongodb://localhost:27017/mistica_autentica"

# Test with Prisma Studio
npx prisma studio
```

### 3. Check Prisma Logs
The enhanced Prisma service now logs connection attempts. Check your console for:
- "Connecting to database..."
- "Successfully connected to database"
- Any error messages

## Common Issues and Solutions

### Issue: Connection Timeout
**Cause**: Network latency, firewall, or MongoDB instance overload
**Solution**: 
- Increase timeout values in connection string
- Check network connectivity
- Verify Railway service status

### Issue: Authentication Failed
**Cause**: Incorrect username/password or authSource
**Solution**:
- Verify credentials in Railway dashboard
- Ensure `authSource=admin` is included
- Check if user has proper permissions

### Issue: Replica Set Configuration
**Cause**: Railway MongoDB might be configured as a replica set
**Solution**:
- Add `replicaSet` parameter if required
- Use `w=majority` for write concerns
- Check Railway MongoDB configuration

### Issue: Local vs Production Mismatch
**Cause**: Environment variables pointing to wrong database
**Solution**:
- Use `.env` for local development
- Use Railway environment variables for production
- Never commit `.env` files to version control

## Railway-Specific Configuration

### 1. Environment Variables in Railway
Set these in your Railway service:
- `DATABASE_URL`: Your MongoDB connection string
- `NODE_ENV`: `production`
- `JWT_SECRET`: Production secret key

### 2. Network Access
- Ensure your Railway backend can access the MongoDB service
- Check if both services are in the same project
- Verify no network restrictions

### 3. Service Dependencies
- Set MongoDB as a dependency for your backend
- Ensure proper startup order

## Debugging Commands

### Check Current Environment
```bash
# Check if .env file exists
ls -la | grep .env

# Check environment variables
echo $DATABASE_URL
echo $NODE_ENV
```

### Test MongoDB Connection
```bash
# Test with telnet (if available)
telnet nozomi.proxy.rlwy.net 23351

# Test with curl (basic connectivity)
curl -v telnet://nozomi.proxy.rlwy.net:23351
```

### Prisma Commands
```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Open Prisma Studio
npx prisma studio
```

## Next Steps

1. **Create `.env` file** with local MongoDB configuration
2. **Test locally** with `npm run start:dev`
3. **Check health endpoint** at `http://localhost:3000/health`
4. **Verify Railway MongoDB** configuration and status
5. **Update production** environment variables in Railway

## Support Resources

- [Prisma MongoDB Documentation](https://www.prisma.io/docs/concepts/database-connectors/mongodb)
- [MongoDB Connection String Format](https://docs.mongodb.com/manual/reference/connection-string/)
- [Railway Documentation](https://docs.railway.app/)
- [NestJS Prisma Integration](https://docs.nestjs.com/techniques/database)
