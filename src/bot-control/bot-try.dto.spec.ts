import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { BotTryDto } from '../common/dto/bot-settings.dto';

// Mismas opciones que el pipe global de main.ts: la conversión implícita es la
// que vaciaba los turnos del historial cuando no tenían clase propia.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const meta: ArgumentMetadata = { type: 'body', metatype: BotTryDto };

describe('BotTryDto (probador del bot)', () => {
  it('conserva los turnos previos de la charla', async () => {
    const history = [
      { role: 'user', content: 'Hola! hacen algo para Halloween?' },
      {
        role: 'assistant',
        content: 'Sí: Especial Halloween, del 20 al 30/10.',
      },
    ];
    const dto = (await pipe.transform(
      { message: 'Dale, somos 2', history },
      meta,
    )) as BotTryDto;
    expect(JSON.parse(JSON.stringify(dto.history))).toEqual(history);
  });

  it('acepta el mensaje sin historial', async () => {
    const dto = (await pipe.transform({ message: 'Hola' }, meta)) as BotTryDto;
    expect(dto.history).toBeUndefined();
  });

  it('rechaza un turno con un rol que no existe', async () => {
    await expect(
      pipe.transform(
        { message: 'Hola', history: [{ role: 'system', content: 'x' }] },
        meta,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
