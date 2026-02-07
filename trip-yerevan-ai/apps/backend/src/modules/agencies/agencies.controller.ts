import { Controller, Get, Param } from '@nestjs/common';
import { AgenciesService } from './agencies.service';

@Controller('agencies')
export class AgenciesController {
  constructor(private readonly agenciesService: AgenciesService) {}

  @Get()
  async findAll() {
    return this.agenciesService.findApproved();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.agenciesService.findById(id);
  }
}
