import { jest } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SignJWT } from 'jose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';
import { CatalogoService } from './../src/catalogo/catalogo.service';
import { ChatService } from './../src/chat/chat.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  afterEach(async () => {
    await app.close();
  });
});

describe('Auth & Gateway Security (e2e)', () => {
  const jwtSecret = 'test_e2e_jwt_secret_hardwareguru';
  let app: INestApplication<App>;
  let mockAuthService: {
    register: jest.Mock<any>;
    login: jest.Mock<any>;
    getMe: jest.Mock<any>;
    updateProfile: jest.Mock<any>;
  };
  let mockChatService: {
    enviarMensaje: jest.Mock<any>;
  };
  let mockCatalogoService: {
    listarComponentes: jest.Mock<any>;
  };

  const signToken = async (
    payload: Record<string, unknown>,
    expiresIn: string | number = '4h',
  ) =>
    new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(new TextEncoder().encode(jwtSecret));

  beforeEach(async () => {
    process.env.JWT_SECRET = jwtSecret;
    process.env.API_KEYS = JSON.stringify([
      {
        key: 'hg_active_key',
        name: 'web-client',
        active: true,
        role: 'service',
        tenantId: 'hg-tenant',
      },
      {
        key: 'hg_inactive_key',
        name: 'revoked-client',
        active: false,
      },
    ]);
    process.env.REQUIRE_API_KEY = 'false';

    mockAuthService = {
      register: jest.fn(),
      login: jest.fn(),
      getMe: jest.fn(),
      updateProfile: jest.fn(),
    };
    mockChatService = {
      enviarMensaje: jest.fn(),
    };
    mockCatalogoService = {
      listarComponentes: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthService)
      .useValue(mockAuthService)
      .overrideProvider(ChatService)
      .useValue(mockChatService)
      .overrideProvider(CatalogoService)
      .useValue(mockCatalogoService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /api/auth/register es público y valida DTO', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ nombre: 'Maxi', email: 'invalido', password: '123' })
      .expect(400);

    mockAuthService.register.mockResolvedValue({
      mensaje: 'Usuario creado',
      user: { id: 2, nombre: 'Maxi', email: 'maxi@hardwareguru.cl' },
    });

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        nombre: 'Maxi',
        email: 'maxi@hardwareguru.cl',
        password: 'password123',
      })
      .expect(201);
  });

  it('POST /api/auth/login es público y devuelve 200', async () => {
    mockAuthService.login.mockResolvedValue({
      mensaje: 'Login exitoso',
      token: 'tok',
      user: { id: 2, nombre: 'Maxi', email: 'maxi@hardwareguru.cl' },
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'maxi@hardwareguru.cl', password: 'password123' })
      .expect(200);

    expect(res.body.token).toBe('tok');
  });

  it('GET /api/auth/me corta peticiones sin token o con x-user-id falsificado con 401', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('x-user-id', '1')
      .expect(401);

    expect(mockAuthService.getMe).not.toHaveBeenCalled();
  });

  it('GET /api/auth/me y PUT /api/auth/profile validan JWT y propagan identidad limpia', async () => {
    const token = await signToken({
      user_id: 2,
      email: 'maxi@hardwareguru.cl',
      role: 'user',
      tenant_id: 'hg-cl',
    });

    mockAuthService.getMe.mockResolvedValue({
      id: 2,
      nombre: 'Maxi',
      email: 'maxi@hardwareguru.cl',
    });

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .set('x-user-id', '999')
      .expect(200);

    expect(mockAuthService.getMe).toHaveBeenCalledWith({
      userId: '2',
      role: 'user',
      tenantId: 'hg-cl',
    });

    mockAuthService.updateProfile.mockResolvedValue({
      mensaje: 'Perfil actualizado',
      usuario: { id: 2, nombre: 'Maxi Nuevo', email: 'maxi@hardwareguru.cl' },
    });

    await request(app.getHttpServer())
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Maxi Nuevo' })
      .expect(200);

    expect(mockAuthService.updateProfile).toHaveBeenCalledWith(
      { nombre: 'Maxi Nuevo' },
      { userId: '2', role: 'user', tenantId: 'hg-cl' },
    );
  });

  it('GET /api/auth/users/:id no debe estar expuesto al público (404)', async () => {
    const token = await signToken({ user_id: 1 });
    await request(app.getHttpServer())
      .get('/api/auth/users/1')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('POST /api/chat corta tráfico sin token o expirado con 401 y propaga identidad si es válido', async () => {
    await request(app.getHttpServer())
      .post('/api/chat')
      .send({ prompt: 'Hola' })
      .expect(401);

    const expiredToken = await signToken(
      { user_id: 2 },
      Math.floor(Date.now() / 1000) - 60,
    );
    await request(app.getHttpServer())
      .post('/api/chat')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({ prompt: 'Hola' })
      .expect(401);

    expect(mockChatService.enviarMensaje).not.toHaveBeenCalled();

    const validToken = await signToken({
      user_id: 2,
      role: 'pro',
      tenant_id: 'hg-cl',
    });
    mockChatService.enviarMensaje.mockResolvedValue({ respuesta: 'OK' });

    await request(app.getHttpServer())
      .post('/api/chat')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ prompt: 'Hola' })
      .expect(200);

    expect(mockChatService.enviarMensaje).toHaveBeenCalledWith(
      { prompt: 'Hola' },
      '2',
      { role: 'pro', tenantId: 'hg-cl' },
    );
  });

  it('Inspecciona x-api-key y rechaza claves inactivas o inválidas incluso en rutas públicas/opcionales', async () => {
    mockCatalogoService.listarComponentes.mockResolvedValue([]);

    await request(app.getHttpServer()).get('/api/componentes').expect(200);

    await request(app.getHttpServer())
      .get('/api/componentes')
      .set('x-api-key', 'hg_active_key')
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/componentes')
      .set('x-api-key', 'hg_inactive_key')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/componentes')
      .set('Authorization', 'Bearer token.invalido.firma')
      .expect(401);
  });
});
