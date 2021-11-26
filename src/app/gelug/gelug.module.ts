import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { GelugRoutingModule } from './gelug-routing.module';
import { MainComponent } from './main/main.component';

import { ModalModule } from 'ngx-bootstrap/modal';

@NgModule({
  declarations: [MainComponent],
  imports: [
    CommonModule,
    GelugRoutingModule,
    ModalModule.forRoot(),
    FormsModule,
  ]
})
export class GelugModule { }
