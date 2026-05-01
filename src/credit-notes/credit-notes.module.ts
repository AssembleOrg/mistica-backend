import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CreditNotesController } from './credit-notes.controller';
import { CreditNotesService } from './credit-notes.service';
import {
  CreditNote,
  CreditNoteSchema,
  Sale,
  SaleSchema,
} from '../common/schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CreditNote.name, schema: CreditNoteSchema },
      { name: Sale.name, schema: SaleSchema },
    ]),
  ],
  controllers: [CreditNotesController],
  providers: [CreditNotesService],
  exports: [CreditNotesService],
})
export class CreditNotesModule {}
