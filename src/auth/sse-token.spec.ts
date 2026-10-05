import {
  Controller,
  Get,
  INestApplication,
  Logger,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AllowSseToken } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User } from '../common/schemas';
import { AuthService } from './auth.service';
import { SSE_TOKEN_AUDIENCE, SSE_TOKEN_TTL_SECONDS } from './sse-token';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SseTokenStrategy } from './strategies/sse-token.strategy';

const SECRET = 'test-secret';
const USER_ID = '64b7f0c2a1b2c3d4e5f60718';

@Controller('t')
class ProbeController {
  @Get('plain')
  @UseGuards(JwtAuthGuard)
  plain(@Req() req: { user: unknown }) {
    return req.user;
  }

  @Get('sse')
  @UseGuards(JwtAuthGuard)
  @AllowSseToken()
  sse(@Req() req: { user: unknown }) {
    return req.user;
  }
}

describe('Token de stream SSE', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let jwt: JwtService;
  let auth: AuthService;

  const userModel = {
    findOne: jest.fn(() => ({
      select: () => ({
        lean: () =>
          Promise.resolve({
            _id: USER_ID,
            email: 'a@b.c',
            role: 'admin',
            allowedViews: [],
          }),
      }),
    })),
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        PassportModule,
        JwtModule.register({
          secret: SECRET,
          signOptions: { expiresIn: '7d' },
        }),
      ],
      controllers: [ProbeController],
      providers: [
        AuthService,
        JwtStrategy,
        SseTokenStrategy,
        { provide: Logger, useValue: { log: jest.fn(), warn: jest.fn() } },
        { provide: getModelToken(User.name), useValue: userModel },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    jwt = moduleRef.get(JwtService);
    auth = moduleRef.get(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  const sessionToken = () =>
    jwt.sign({ sub: USER_ID, email: 'a@b.c', role: 'admin', allowedViews: [] });

  it('emite un token corto con tipo y audiencia propios', () => {
    const { token, expiresIn } = auth.issueStreamToken(USER_ID);
    expect(expiresIn).toBe(SSE_TOKEN_TTL_SECONDS);
    const payload = jwt.verify<{ exp: number; iat: number }>(token, {
      audience: SSE_TOKEN_AUDIENCE,
    });
    expect(payload).toMatchObject({
      sub: USER_ID,
      typ: 'sse',
      aud: SSE_TOKEN_AUDIENCE,
    });
    expect(payload.exp - payload.iat).toBe(SSE_TOKEN_TTL_SECONDS);
  });

  it('abre el stream con ?token=', async () => {
    const { token } = auth.issueStreamToken(USER_ID);
    const res = await request(server).get(`/t/sse?token=${token}`).expect(200);
    expect(res.body).toMatchObject({ id: USER_ID, role: 'admin' });
  });

  it('sigue aceptando la cookie de sesión en el stream', async () => {
    await request(server)
      .get('/t/sse')
      .set('Cookie', `access_token=${sessionToken()}`)
      .expect(200);
  });

  it('rechaza el stream sin credenciales', async () => {
    await request(server).get('/t/sse').expect(401);
  });

  it('rechaza un token de stream vencido', async () => {
    const expired = jwt.sign(
      { sub: USER_ID, typ: 'sse' },
      { audience: SSE_TOKEN_AUDIENCE, expiresIn: -10 },
    );
    await request(server).get(`/t/sse?token=${expired}`).expect(401);
  });

  it('rechaza un token de stream firmado con otro secreto', async () => {
    const forged = new JwtService({ secret: 'otro' }).sign(
      { sub: USER_ID, typ: 'sse' },
      { audience: SSE_TOKEN_AUDIENCE, expiresIn: 60 },
    );
    await request(server).get(`/t/sse?token=${forged}`).expect(401);
  });

  it('no acepta un token de sesión en ?token= (falta la audiencia sse)', async () => {
    await request(server).get(`/t/sse?token=${sessionToken()}`).expect(401);
  });

  it('el token de stream no sirve como sesión: ni en la cookie ni en ?token=', async () => {
    const { token } = auth.issueStreamToken(USER_ID);
    await request(server)
      .get('/t/plain')
      .set('Cookie', `access_token=${token}`)
      .expect(401);
    await request(server).get(`/t/plain?token=${token}`).expect(401);
    await request(server)
      .get('/t/sse')
      .set('Cookie', `access_token=${token}`)
      .expect(401);
  });

  it('la cookie de sesión sigue funcionando en endpoints comunes', async () => {
    await request(server)
      .get('/t/plain')
      .set('Cookie', `access_token=${sessionToken()}`)
      .expect(200);
  });
});
