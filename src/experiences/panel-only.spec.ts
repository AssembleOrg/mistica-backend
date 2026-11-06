import { ExperiencesService } from './experiences.service';

describe('experiencia "solo desde el panel"', () => {
  it('la web y el bot la ven como servicio coordinado', async () => {
    const docs = [
      { name: 'Arte & Degustación', bookableOnline: true, specials: [] },
      { name: 'Promo noviembre', bookableOnline: true, panelOnly: true, specials: [] },
    ];
    const model = { find: () => ({ sort: () => ({ lean: async () => docs }) }) };
    const service = new ExperiencesService(model as never, {} as never, {} as never, {} as never, {} as never);
    const list = await service.listPublicExperiences();
    expect(list.map((e) => [e.name, e.bookableOnline])).toEqual([
      ['Arte & Degustación', true],
      ['Promo noviembre', false],
    ]);
  });
});
